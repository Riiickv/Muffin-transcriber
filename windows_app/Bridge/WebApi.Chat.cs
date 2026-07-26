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
            if (target.Title == AppStrings.Chat_NewChat || target.Title == "New chat")
            {
                target.Title = text.Length > 40 ? text[..40] : text;
            }

            _chatBusy = true;
            Emit("chat.busy", new Dictionary<string, object?> { ["busy"] = true, ["id"] = target.Id });

            try
            {
                string reply = await ChatEngine.ChatAsync(target.Messages, _settings.PreferredFormatterModel, chunk =>
                    Emit("chat.token", new Dictionary<string, object?> { ["id"] = target.Id, ["text"] = chunk }));

                target.Messages.Add(new ChatMessage("assistant", reply));
                target.UpdatedAt = DateTime.Now;

                await ExecuteToolCalls(reply);

                string visible = StripToolCalls(reply);
                return new Dictionary<string, object?>
                {
                    ["id"] = target.Id,
                    ["text"] = string.IsNullOrWhiteSpace(visible) ? AppStrings.Chat_Done : visible,
                    ["sessions"] = _sessions.Select(SessionMap).ToList(),
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object?>
                {
                    ["id"] = target.Id,
                    ["error"] = EngineHealth.FriendlyMessage(ex) ?? ex.Message,
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
        ["messages"] = session.Messages.Select(m => new Dictionary<string, object?>
        {
            ["role"] = m.Role,
            ["content"] = m.Role == "assistant" ? StripToolCalls(m.Content) : m.Content,
        }).ToList(),
    };

    // ---- tool calls --------------------------------------------------------

    private static string StripToolCalls(string text)
    {
        string t = Regex.Replace(text, @"<tool_call>[\s\S]*?</tool_call>", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"<tool_call>[\s\S]*$", "", RegexOptions.IgnoreCase);
        return t.Trim();
    }

    private async Task ExecuteToolCalls(string reply)
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

        foreach (JsonElement call in calls) await Dispatch(call);
    }

    private Task Dispatch(JsonElement call)
    {
        if (!call.TryGetProperty("action", out JsonElement actionEl)) return Task.CompletedTask;

        switch ((actionEl.GetString() ?? "").ToUpperInvariant())
        {
            case "SET_SETTING":
            {
                SettingSpec? spec = AppCapabilities.GetSpec(Str(call, "key"));
                if (spec is not null && call.TryGetProperty("value", out JsonElement value))
                {
                    // Routed through the same path the UI uses, so a setting the
                    // assistant changes lights up on screen like any other.
                    ApplySetting(spec.Key, Coerce(spec, value));
                }
                break;
            }

            case "SHOW_SETTING":
            {
                SettingSpec? spec = AppCapabilities.GetSpec(Str(call, "key"));
                if (spec is not null) Emit("chat.showSetting", new Dictionary<string, object?> { ["key"] = spec.Key });
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
                break;
            }
        }

        return Task.CompletedTask;
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

    private static TranscriptionHistoryItem? FindTranscript(JsonElement call)
    {
        List<TranscriptionHistoryItem> history = TranscriptionHistory.Load();

        string id = Str(call, "transcript_id");
        if (id.Length > 0)
        {
            TranscriptionHistoryItem? byId = history.FirstOrDefault(h => h.Id == id);
            if (byId is not null) return byId;
        }

        string name = Str(call, "transcript_name").ToLowerInvariant();
        if (name.Length == 0) return null;

        return history.FirstOrDefault(h =>
            Path.GetFileNameWithoutExtension(h.SourceFileName).ToLowerInvariant().Contains(name));
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
