using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace MuffinTranscriber;

public sealed class ChatSession
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Title { get; set; } = "New chat";
    public List<ChatMessage> Messages { get; set; } = new();
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public static class WinChatStore
{
    private static readonly string ChatsFile = Path.Combine(AppModel.AppDataDir, "chats.json");
    private static readonly object _lock = new();
    private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };

    public static List<ChatSession> Load()
    {
        lock (_lock)
        {
            try
            {
                if (File.Exists(ChatsFile))
                    return JsonSerializer.Deserialize<List<ChatSession>>(File.ReadAllText(ChatsFile)) ?? new();
            }
            catch { }
            return new();
        }
    }

    public static void Save(List<ChatSession> sessions)
    {
        lock (_lock)
        {
            try { File.WriteAllText(ChatsFile, JsonSerializer.Serialize(sessions, Opts)); }
            catch { }
        }
    }
}
