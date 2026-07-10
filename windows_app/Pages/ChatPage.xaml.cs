using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace MuffinTranscriber.Pages;

public sealed partial class ChatPage : Page
{
    private List<ChatSession> _sessions = new();
    private ChatSession? _active;
    private bool _busy;

    public ChatPage()
    {
        InitializeComponent();
        _sessions = WinChatStore.Load();
        RefreshSessionList();
        if (_sessions.Count > 0)
        {
            _active = _sessions[0];
            SessionList.SelectedItem = _active;
        }
        RenderActive();
    }

    // ---- Sessions ----------------------------------------------------------

    private void TogglePane_Click(object sender, RoutedEventArgs e) => Split.IsPaneOpen = !Split.IsPaneOpen;

    private void NewChat_Click(object sender, RoutedEventArgs e)
    {
        if (_active is { Messages.Count: 0 }) return; // already on a fresh chat

        _active = new ChatSession();
        _sessions.Insert(0, _active);
        RefreshSessionList();
        RenderActive();
    }

    private void SessionList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SessionList.SelectedItem is ChatSession s && !ReferenceEquals(s, _active))
        {
            _active = s;
            RenderActive();
        }
    }

    private void DeleteSession_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button b && b.Tag is string id)
        {
            ChatSession? s = _sessions.FirstOrDefault(x => x.Id == id);
            if (s is null) return;

            _sessions.Remove(s);
            if (ReferenceEquals(s, _active)) _active = _sessions.FirstOrDefault();
            WinChatStore.Save(_sessions);
            RefreshSessionList();
            SessionList.SelectedItem = _active;
            RenderActive();
        }
    }

    private void RefreshSessionList()
    {
        SessionList.ItemsSource = null;
        SessionList.ItemsSource = _sessions;
        SessionList.SelectedItem = _active;
    }

    private void RenderActive()
    {
        MessagesPanel.Children.Clear();
        bool empty = _active is null || _active.Messages.Count == 0;
        EmptyHint.Visibility = empty ? Visibility.Visible : Visibility.Collapsed;

        if (_active is not null)
        {
            foreach (ChatMessage m in _active.Messages)
            {
                if (m.Role == "user")
                {
                    AddUserBubble(m.Content);
                }
                else
                {
                    TextBlock tb = AddAssistantBubble();
                    string visible = StripToolCalls(m.Content);
                    tb.Text = string.IsNullOrWhiteSpace(visible) ? AppStrings.Chat_Done : visible;
                }
            }
        }
        ScrollToBottom();
    }

    // ---- Send --------------------------------------------------------------

    private void InputBox_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Enter)
        {
            e.Handled = true;
            _ = SendAsync();
        }
    }

    private void SendButton_Click(object sender, RoutedEventArgs e) => _ = SendAsync();

    private async Task SendAsync()
    {
        if (_busy) return;
        string text = InputBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;

        if (_active is null)
        {
            _active = new ChatSession();
            _sessions.Insert(0, _active);
        }

        EmptyHint.Visibility = Visibility.Collapsed;
        InputBox.Text = "";
        _busy = true;
        SendButton.IsEnabled = false;

        // Capture the target session before any await, so switching sessions
        // mid-stream can't append the reply to the wrong conversation.
        ChatSession target = _active;
        target.Messages.Add(new ChatMessage("user", text));
        if (target.Title == "New chat") target.Title = text.Length > 40 ? text[..40] : text;

        AddUserBubble(text);
        TextBlock assistant = AddAssistantBubble();
        assistant.Text = AppStrings.Chat_Thinking;

        try
        {
            bool first = true;
            string reply = await ChatEngine.ChatAsync(target.Messages, UserSettings.Load().PreferredFormatterModel, chunk =>
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    if (first) { assistant.Text = ""; first = false; }
                    assistant.Text += chunk;
                    ScrollToBottom();
                });
            });

            target.Messages.Add(new ChatMessage("assistant", reply));
            target.UpdatedAt = DateTime.Now;

            string visible = StripToolCalls(reply);
            assistant.Text = string.IsNullOrWhiteSpace(visible) ? AppStrings.Chat_Done : visible;
            await ExecuteToolCalls(reply);
            ScrollToBottom();
        }
        catch (Exception ex)
        {
            assistant.Text = ex.Message;
        }
        finally
        {
            _busy = false;
            SendButton.IsEnabled = true;
            if (_sessions.Remove(target)) _sessions.Insert(0, target);
            WinChatStore.Save(_sessions);
            RefreshSessionList();
        }
    }

    // ---- Message bubbles ---------------------------------------------------

    private void AddUserBubble(string text)
    {
        MessagesPanel.Children.Add(new Border
        {
            Background = (Brush)Application.Current.Resources["AccentFillColorDefaultBrush"],
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            HorizontalAlignment = HorizontalAlignment.Right,
            MaxWidth = 520,
            Child = new TextBlock
            {
                Text = text,
                TextWrapping = TextWrapping.Wrap,
                Foreground = (Brush)Application.Current.Resources["TextOnAccentFillColorPrimaryBrush"],
            },
        });
        ScrollToBottom();
    }

    private TextBlock AddAssistantBubble()
    {
        var tb = new TextBlock { TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true };
        MessagesPanel.Children.Add(new Border
        {
            Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"],
            BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"],
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            HorizontalAlignment = HorizontalAlignment.Left,
            MaxWidth = 520,
            Child = tb,
        });
        ScrollToBottom();
        return tb;
    }

    // Bound to the same store as the Settings page, so flipping it here changes it everywhere.
    private void AddSettingControl(SettingSpec spec)
    {
        UserSettings settings = UserSettings.Load();
        string current = AppCapabilities.GetValue(settings, spec);

        var labels = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        labels.Children.Add(new TextBlock { Text = spec.Label, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
        labels.Children.Add(new TextBlock { Text = spec.Location, Opacity = 0.7, FontSize = 12 });

        FrameworkElement control;
        if (spec.Type == "boolean")
        {
            var toggle = new ToggleSwitch { IsOn = current == "true", OnContent = null, OffContent = null, MinWidth = 0 };
            toggle.Toggled += (s, e) => AppCapabilities.SetValue(spec, toggle.IsOn);
            control = toggle;
        }
        else
        {
            var combo = new ComboBox
            {
                ItemsSource = spec.Options,
                SelectedItem = spec.Options.FirstOrDefault(o => o == current),
                MinWidth = 170,
            };
            combo.SelectionChanged += (s, e) => { if (combo.SelectedItem is string v) AppCapabilities.SetValue(spec, v); };
            control = combo;
        }
        control.VerticalAlignment = VerticalAlignment.Center;

        var grid = new Grid { ColumnSpacing = 12 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(labels, 0);
        Grid.SetColumn(control, 1);
        grid.Children.Add(labels);
        grid.Children.Add(control);

        MessagesPanel.Children.Add(new Border
        {
            Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"],
            BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"],
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12),
            HorizontalAlignment = HorizontalAlignment.Stretch,
            Child = grid,
        });
        ScrollToBottom();
    }

    private void ScrollToBottom()
    {
        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null, true);
    }

    // ---- Tool calls --------------------------------------------------------

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
            Match fb = Regex.Match(reply, @"\{[\s\S]*?""action""[\s\S]*?\}", RegexOptions.IgnoreCase);
            if (fb.Success && TryParseJson(fb.Value, out JsonElement el)) calls.Add(el);
        }

        foreach (JsonElement call in calls) await Dispatch(call);
    }

    private async Task Dispatch(JsonElement call)
    {
        if (!call.TryGetProperty("action", out JsonElement actionEl)) return;
        string action = (actionEl.GetString() ?? "").ToUpperInvariant();

        switch (action)
        {
            case "SET_SETTING":
            {
                SettingSpec? spec = AppCapabilities.GetSpec(GetStr(call, "key"));
                if (spec is not null)
                {
                    AppCapabilities.SetValue(spec, SpecValue(call, spec));
                    AddSettingControl(spec);
                }
                break;
            }
            case "SHOW_SETTING":
            {
                SettingSpec? spec = AppCapabilities.GetSpec(GetStr(call, "key"));
                if (spec is not null) AddSettingControl(spec);
                break;
            }
            case "NAVIGATE_TO":
            {
                (App.MainWindow as MainWindow)?.NavigateTo(GetStr(call, "tab").ToLowerInvariant());
                break;
            }
            case "DELETE_TRANSCRIPT":
            {
                await ConfirmDelete(call);
                break;
            }
        }
    }

    private async Task ConfirmDelete(JsonElement call)
    {
        var history = TranscriptionHistory.Load();
        TranscriptionHistoryItem? target = null;

        string id = GetStr(call, "transcript_id");
        if (!string.IsNullOrEmpty(id)) target = history.FirstOrDefault(h => h.Id == id);
        if (target is null)
        {
            string name = GetStr(call, "transcript_name").ToLowerInvariant();
            if (!string.IsNullOrEmpty(name))
                target = history.FirstOrDefault(h => Path.GetFileNameWithoutExtension(h.SourceFileName).ToLowerInvariant().Contains(name));
        }
        if (target is null) return;

        var dialog = new ContentDialog
        {
            Title = AppStrings.Chat_DeleteTitle,
            Content = string.Format(AppStrings.Chat_DeleteConfirm, Path.GetFileNameWithoutExtension(target.SourceFileName)),
            PrimaryButtonText = AppStrings.Chat_Delete,
            CloseButtonText = AppStrings.Chat_Cancel,
            DefaultButton = ContentDialogButton.Close,
            XamlRoot = this.XamlRoot,
        };

        if (await dialog.ShowAsync() == ContentDialogResult.Primary)
        {
            TranscriptionHistory.Delete(target.Id);
        }
    }

    private static bool TryParseJson(string json, out JsonElement el)
    {
        el = default;
        try
        {
            string clean = json.Replace("```json", "").Replace("```", "").Trim();
            using JsonDocument doc = JsonDocument.Parse(clean);
            el = doc.RootElement.Clone();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string GetStr(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out JsonElement v)
            ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ToString())
            : "";

    private static object SpecValue(JsonElement call, SettingSpec spec)
    {
        if (!call.TryGetProperty("value", out JsonElement v)) return spec.Type == "boolean" ? false : "";
        if (spec.Type == "boolean")
        {
            if (v.ValueKind == JsonValueKind.True) return true;
            if (v.ValueKind == JsonValueKind.False) return false;
            string s = v.ToString().ToLowerInvariant();
            return s is "true" or "on" or "1" or "yes";
        }
        return v.ToString();
    }
}
