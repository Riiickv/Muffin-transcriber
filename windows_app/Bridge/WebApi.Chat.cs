using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MuffinTranscriber.Web;

/// <summary>
/// Chat with Muffin: sessions, the streamed reply, and the tool calls the
/// assistant can make (change a setting, open a screen, delete a transcript).
/// </summary>
public sealed partial class WebBridge
{
    private List<ChatSession> _sessions = WinChatStore.Load();
    private bool _chatBusy;

    private void RegisterChatHandlers()
    {
        Register("chat.sessions", _ => (object?)_sessions.Select(SessionMap).ToList());

        // Asked for on load. A reply carries on generating while you are on
        // another tab, and coming back showed a ready-looking composer whose
        // send button silently did nothing, because chat.send refuses while
        // one is already running.
        Register("chat.state", _ => (object?)new Dictionary<string, object?>
        {
            ["busy"] = _chatBusy,
            ["id"] = _sessions.FirstOrDefault()?.Id ?? "",
        });

        Register("chat.open", args =>
        {
            ChatSession? session = _sessions.FirstOrDefault(s => s.Id == Str(args, "id"));
            return session is null ? null : (object?)FullSessionMap(session);
        });

        Register("chat.new", _ =>
        {
            // Already sitting on an empty chat: reuse it rather than piling up
            // identical "New chat" rows.
            ChatSession? empty = _sessions.FirstOrDefault(s => s.Messages.Count == 0);
            if (empty is not null) return (object?)FullSessionMap(empty);

            var session = new ChatSession { Title = AppStrings.Chat_NewChat };
            _sessions.Insert(0, session);
            WinChatStore.Save(_sessions);
            return (object?)FullSessionMap(session);
        });

        Register("chat.rename", args =>
        {
            ChatSession? session = _sessions.FirstOrDefault(s => s.Id == Str(args, "id"));
            string title = Str(args, "title").Trim();
            if (session is null || title.Length == 0) return null;
            session.Title = title;
            WinChatStore.Save(_sessions);
            return (object?)_sessions.Select(SessionMap).ToList();
        });

        // What the user answered to the assistant's rename question. The rename
        // itself goes through history.rename like any other; this is only how
        // the model finds out, so its next reply is about what happened rather
        // than what it hoped would happen.
        Register("chat.renameAnswered", args =>
        {
            ChatSession? session = _sessions.FirstOrDefault(s => s.Id == Str(args, "chatId"))
                                  ?? _sessions.FirstOrDefault();
            if (session is null) return (object?)null;

            string oldName = Str(args, "current");
            string newName = Str(args, "name").Trim();
            Note(session, newName.Length > 0
                ? $"The user answered: renamed \"{oldName}\" to \"{newName}\"."
                : $"The user cancelled; \"{oldName}\" was NOT renamed.");
            return (object?)null;
        });

        Register("chat.delete", args =>
        {
            _sessions.RemoveAll(s => s.Id == Str(args, "id"));
            WinChatStore.Save(_sessions);
            return (object?)_sessions.Select(SessionMap).ToList();
        });

        Register("chat.clearAll", _ =>
        {
            _sessions = new List<ChatSession>();
            WinChatStore.Save(_sessions);
            return (object?)_sessions.Select(SessionMap).ToList();
        });

        Register("chat.send", async args =>
        {
            if (_chatBusy) return null;

            string text = Str(args, "text").Trim();
            if (text.Length == 0) return null;

            ChatSession? session = _sessions.FirstOrDefault(s => s.Id == Str(args, "id"));
            if (session is null)
            {
                session = new ChatSession { Title = AppStrings.Chat_NewChat };
                _sessions.Insert(0, session);
            }

            // Captured before any await: switching sessions mid-stream must not
            // append the reply to the wrong conversation.
            ChatSession target = session;
            target.Messages.Add(new ChatMessage("user", text));
            bool unnamed = target.Title == AppStrings.Chat_NewChat || target.Title == "New chat";
            if (unnamed)
            {
                // The first message, trimmed, so the row is never blank while
                // the real name is being worked out.
                target.Title = text.Length > 40 ? text[..40] : text;
            }

            _chatBusy = true;
            Emit("chat.busy", new Dictionary<string, object?> { ["busy"] = true, ["id"] = target.Id });

            try
            {
                string reply = await ChatEngine.ChatAsync(target.Messages, FormatterKey(), chunk =>
                    Emit("chat.token", new Dictionary<string, object?> { ["id"] = target.Id, ["text"] = chunk }));

                target.Messages.Add(new ChatMessage("assistant", reply));
                target.UpdatedAt = DateTime.Now;

                List<Dictionary<string, object?>> actions = await ExecuteToolCalls(reply, target);

                // Named from the exchange rather than from the question alone:
                // "can you retranscribe the last one for me?" as a row title
                // says nothing that the next twenty rows will not also say.
                if (unnamed) _ = NameChatAsync(target, text, reply);

                return new Dictionary<string, object?>
                {
                    ["id"] = target.Id,
                    ["text"] = StripToolCalls(reply),
                    ["actions"] = actions,
                    ["sessions"] = _sessions.Select(SessionMap).ToList(),
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object?>
                {
                    ["id"] = target.Id,
                    ["error"] = AppStrings.Chat_ErrorMessage + "\n\n" + (EngineHealth.FriendlyMessage(ex) ?? ex.Message),
                };
            }
            finally
            {
                _chatBusy = false;
                if (_sessions.Remove(target)) _sessions.Insert(0, target);
                WinChatStore.Save(_sessions);
                Emit("chat.busy", new Dictionary<string, object?> { ["busy"] = false, ["id"] = target.Id });
            }
        });
    }

    private static Dictionary<string, object?> SessionMap(ChatSession session) => new()
    {
        ["id"] = session.Id,
        ["title"] = session.Title,
        ["updatedAt"] = session.UpdatedAt.ToString("o"),
        ["messageCount"] = session.Messages.Count,
    };

    private static Dictionary<string, object?> FullSessionMap(ChatSession session) => new()
    {
        ["id"] = session.Id,
        ["title"] = session.Title,
        // Chips are derived from the stored reply, never re-executed: reopening
        // a conversation must not change a setting again. The [action result]
        // notes are for the model, not the user, so they are not drawn.
        ["messages"] = session.Messages.Where(m => m.Role != "system").Select(m => new Dictionary<string, object?>
        {
            ["role"] = m.Role,
            ["content"] = m.Role == "assistant" ? StripToolCalls(m.Content) : m.Content,
            ["actions"] = m.Role == "assistant" ? NamedActions(m.Content) : null,
        }).ToList(),
    };

    // ---- tool calls --------------------------------------------------------

    private static string StripToolCalls(string text)
    {
        string t = Regex.Replace(text, @"<tool_call>[\s\S]*?</tool_call>", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"<tool_call>[\s\S]*$", "", RegexOptions.IgnoreCase);
        return t.Trim();
    }

    private static List<JsonElement> ParseToolCalls(string reply)
    {
        var calls = new List<JsonElement>();
        foreach (Match m in Regex.Matches(reply, @"<tool_call>([\s\S]*?)</tool_call>", RegexOptions.IgnoreCase))
        {
            if (TryParseJson(m.Groups[1].Value, out JsonElement el)) calls.Add(el);
        }
        if (calls.Count == 0)
        {
            Match fallback = Regex.Match(reply, @"\{[\s\S]*?""action""[\s\S]*?\}", RegexOptions.IgnoreCase);
            if (fallback.Success && TryParseJson(fallback.Value, out JsonElement el)) calls.Add(el);
        }
        return calls;
    }

    /// <summary>
    /// What a stored reply asked for, for redrawing an old conversation. Parses
    /// only: reopening a chat must never run its actions a second time.
    /// </summary>
    private static List<Dictionary<string, object?>> NamedActions(string reply) =>
        ParseToolCalls(reply)
            .Where(call => call.TryGetProperty("action", out _))
            .Select(call =>
            {
                var entry = new Dictionary<string, object?>
                {
                    ["action"] = call.GetProperty("action").GetString() ?? "",
                    ["ok"] = true,
                };

                // Reopening a conversation shows the same live control it did
                // the first time, rather than a chip about a setting.
                SettingSpec? spec = AppCapabilities.GetSpec(Str(call, "key"));
                if (spec is not null)
                {
                    entry["setting"] = new Dictionary<string, object?>
                    {
                        ["key"] = spec.Key,
                        ["label"] = spec.Label,
                        ["location"] = spec.Location,
                        ["type"] = spec.Type,
                        ["options"] = spec.Options,
                    };
                }
                return entry;
            })
            .ToList();

    private async Task<List<Dictionary<string, object?>>> ExecuteToolCalls(string reply, ChatSession session)
    {
        var results = new List<Dictionary<string, object?>>();
        foreach (JsonElement call in ParseToolCalls(reply))
        {
            results.Add(await Dispatch(call, session));
        }
        return results;
    }

    /// <summary>
    /// What actually happened, written back into the conversation so the model
    /// reads it next turn. Without this it only ever sees its own sentence and
    /// carries on as though every action succeeded, which is how "I renamed it"
    /// gets said about a rename the user cancelled.
    /// </summary>
    /// <summary>
    /// Names a chat in at most three words once it has something to name: the
    /// first question and the answer to it. Not awaited, so the reply is never
    /// held up by it, and skipped if the user renamed the chat in the meantime.
    /// </summary>
    private async Task NameChatAsync(ChatSession session, string question, string reply)
    {
        string firstTitle = session.Title;
        try
        {
            string? title = await LLMFormatter.GenerateTitleAsync(question + "\n\n" + reply, FormatterKey());
            if (string.IsNullOrWhiteSpace(title) || session.Title != firstTitle) return;

            session.Title = title;
            WinChatStore.Save(_sessions);
            Emit("chat.sessionsChanged", null);
        }
        catch (Exception ex)
        {
            // The chat keeps the first line of the question as its name.
            CrashLog.Write("Naming a chat", ex);
        }
    }

    private void Note(ChatSession session, string note)
    {
        session.Messages.Add(new ChatMessage("system", "[action result] " + note));
        WinChatStore.Save(_sessions);
    }

    // Returns what happened, so the screen can show a chip under the reply the
    // way the mobile app does, instead of the action replacing the reply.
    private Task<Dictionary<string, object?>> Dispatch(JsonElement call, ChatSession session)
    {
        // reason: what to tell the user when it did not work. "Couldn't do that"
        // on its own is a dead end - it says something failed and nothing about
        // what to do instead.
        Dictionary<string, object?> Result(string action, bool ok, string? reason = null) =>
            new() { ["action"] = action, ["ok"] = ok, ["reason"] = reason };

        // A setting action carries the setting itself, so the chat can show the
        // live control the mobile app shows instead of a bare "Done" chip.
        Dictionary<string, object?> WithSetting(string action, SettingSpec spec) => new()
        {
            ["action"] = action,
            ["ok"] = true,
            ["setting"] = new Dictionary<string, object?>
            {
                ["key"] = spec.Key,
                ["label"] = spec.Label,
                ["location"] = spec.Location,
                ["type"] = spec.Type,
                ["options"] = spec.Options,
            },
        };

        if (!call.TryGetProperty("action", out JsonElement actionEl))
        {
            return Task.FromResult(Result("", false));
        }

        string name = (actionEl.GetString() ?? "").ToUpperInvariant();
        bool handled = true;

        switch (name)
        {
            case "SET_SETTING":
            {
                SettingSpec? setSpec = AppCapabilities.GetSpec(Str(call, "key"));
                if (setSpec is not null && call.TryGetProperty("value", out JsonElement value))
                {
                    // Routed through the same path the UI uses, so a setting the
                    // assistant changes lights up on screen like any other.
                    ApplySetting(setSpec.Key, Coerce(setSpec, value));
                    return Task.FromResult(WithSetting(name, setSpec));
                }
                handled = false;
                break;
            }

            case "SHOW_SETTING":
            {
                SettingSpec? showSpec = AppCapabilities.GetSpec(Str(call, "key"));
                if (showSpec is not null) return Task.FromResult(WithSetting(name, showSpec));
                handled = false;
                break;
            }

            case "NAVIGATE_TO":
                Emit("navigate", new Dictionary<string, object?> { ["tab"] = Str(call, "tab").ToLowerInvariant() });
                break;

            case "DELETE_TRANSCRIPT":
            {
                TranscriptionHistoryItem? target = FindTranscript(call);
                if (target is not null)
                {
                    // The app never deletes on its own say-so: the page asks.
                    Emit("chat.confirmDelete", new Dictionary<string, object?>
                    {
                        ["id"] = target.Id,
                        ["name"] = Path.GetFileNameWithoutExtension(target.SourceFileName),
                    });
                }
                else handled = false;
                break;
            }

            case "RENAME_TRANSCRIPT":
            {
                TranscriptionHistoryItem? target = FindTranscript(call, preferNewest: true);
                if (target is null)
                {
                    Note(session, "FAILED: there are no transcripts at all, so there is nothing to rename.");
                    handled = false;
                    break;
                }

                // ALWAYS ask, never rename straight from the model's text. The
                // name is free text with nothing to validate it against, and a
                // small model gets it wrong in ways that quietly corrupt
                // something the user cares about: it invents a name, or echoes
                // the current one back, or appends instead of replacing. So its
                // job shrinks to the part it CAN do - which transcript - and the
                // name comes from the person who knows it. A sensible
                // suggestion is prefilled: one click when it is right.
                string current = Path.GetFileNameWithoutExtension(target.SourceFileName);
                string proposed = Str(call, "new_name");
                if (proposed.Length == 0) proposed = Str(call, "name");
                proposed = proposed.Trim();
                // Renaming X to X is not a name, it is the model echoing.
                if (string.Equals(proposed, current, StringComparison.OrdinalIgnoreCase)) proposed = "";

                Emit("chat.askRename", new Dictionary<string, object?>
                {
                    ["id"] = target.Id,
                    ["current"] = current,
                    ["proposed"] = proposed,
                });

                Note(session, proposed.Length > 0
                    ? $"Suggested renaming \"{current}\" to \"{proposed}\" and asked the user to confirm. Do not claim it is renamed until they do."
                    : $"Asked the user what to call \"{current}\". Wait for their answer.");
                break;
            }

            default:
                // An action that does not exist. The model invented it because
                // the user asked for something real that chat cannot do, so the
                // honest answer names the thing and where it lives.
                Note(session, $"FAILED: \"{name}\" is not something you can do. Tell the user plainly, in one sentence, that you cannot do it from the chat, say which screen it is done on, and offer to take them there.");
                return Task.FromResult(Result(name, false, AppStrings.Chat_ActionUnsupported));
        }

        return Task.FromResult(Result(name, handled));
    }

    // The model answers with strings even for switches; the spec says what the
    // setting really is.
    private static JsonElement Coerce(SettingSpec spec, JsonElement value)
    {
        if (spec.Type != "boolean") return value;
        if (value.ValueKind is JsonValueKind.True or JsonValueKind.False) return value;

        bool on = (value.ToString() ?? "").ToLowerInvariant() is "true" or "on" or "1" or "yes";
        using JsonDocument doc = JsonDocument.Parse(on ? "true" : "false");
        return doc.RootElement.Clone();
    }

    private static TranscriptionHistoryItem? FindTranscript(JsonElement call, bool preferNewest = false)
    {
        List<TranscriptionHistoryItem> history = TranscriptionHistory.Load();

        string id = Str(call, "transcript_id");
        if (id.Length > 0)
        {
            TranscriptionHistoryItem? byId = history.FirstOrDefault(h => h.Id == id);
            if (byId is not null) return byId;
        }

        string name = Str(call, "transcript_name").ToLowerInvariant();
        if (name.Length > 0)
        {
            TranscriptionHistoryItem? byName = history.FirstOrDefault(h =>
                Path.GetFileNameWithoutExtension(h.SourceFileName).ToLowerInvariant().Contains(name));
            if (byName is not null) return byName;
        }

        // Renaming is told to leave the id out when it is unsure, and "rename
        // that" almost always means the one just made. Deleting gets no such
        // guess: the wrong one there is unrecoverable.
        return preferNewest ? history.OrderByDescending(h => h.Timestamp).FirstOrDefault() : null;
    }

    private static bool TryParseJson(string json, out JsonElement element)
    {
        element = default;
        try
        {
            string clean = json.Replace("```json", "").Replace("```", "").Trim();
            using JsonDocument doc = JsonDocument.Parse(clean);
            element = doc.RootElement.Clone();
            return true;
        }
        catch
        {
            return false;
        }
    }
}
