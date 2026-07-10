using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace MuffinTranscriber;

// Writes an .ics file and opens it in the default calendar app, where the user
// finalizes the date/time. An unpackaged app can't use AppointmentManager, and
// the LLM only gives a loose quote — so the calendar app is the confirm step.
public static class CalendarHelper
{
    public static void AddEvent(string title, string description, DateTime start, bool allDay)
    {
        string path = Path.Combine(Path.GetTempPath(), $"muffin_event_{Guid.NewGuid():N}.ics");
        File.WriteAllText(path, BuildIcs(title, description, start, allDay), new UTF8Encoding(false));
        Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
    }

    private static string BuildIcs(string title, string description, DateTime start, bool allDay)
    {
        var sb = new StringBuilder();
        sb.AppendLine("BEGIN:VCALENDAR");
        sb.AppendLine("VERSION:2.0");
        sb.AppendLine("PRODID:-//Muffin Transcriber//EN");
        sb.AppendLine("BEGIN:VEVENT");
        sb.AppendLine($"UID:{Guid.NewGuid():N}@muffin");
        sb.AppendLine($"DTSTAMP:{DateTime.UtcNow:yyyyMMddTHHmmssZ}");
        if (allDay)
        {
            sb.AppendLine($"DTSTART;VALUE=DATE:{start:yyyyMMdd}");
            sb.AppendLine($"DTEND;VALUE=DATE:{start.AddDays(1):yyyyMMdd}");
        }
        else
        {
            sb.AppendLine($"DTSTART:{start:yyyyMMddTHHmmss}");
            sb.AppendLine($"DTEND:{start.AddHours(1):yyyyMMddTHHmmss}");
        }
        sb.AppendLine($"SUMMARY:{Escape(title)}");
        if (!string.IsNullOrWhiteSpace(description)) sb.AppendLine($"DESCRIPTION:{Escape(description)}");
        sb.AppendLine("END:VEVENT");
        sb.AppendLine("END:VCALENDAR");
        return sb.ToString();
    }

    private static string Escape(string s) =>
        s.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\r\n", "\\n").Replace("\n", "\\n");
}
