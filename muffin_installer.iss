#define MyAppName "Muffin Transcriber"
#define MyAppVersion "1.12.23"
#define MyAppPublisher "Muffin Open Source"
#define MyAppExeName "MuffinTranscriber.exe"

; EDIT THIS URL TO POINT TO YOUR GITHUB RELEASE!
#define EnginesUrl "https://github.com/Riiickv/Muffin-transcriber/releases/download/v1.0.0/muffin-engines.zip"

; Path to the published app files. Override on the command line with
;   iscc /DAppFilesDir="D:\somewhere\else" muffin_installer.iss
; if your publish folder lives somewhere other than the default.
#ifndef AppFilesDir
  #define AppFilesDir "windows_app\bin\Release\net10.0-windows10.0.26100.0\win-x64\publish"
#endif

[Setup]
AppId={{8B841A83-F1C5-4845-9892-069E6E9222B5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\dist
OutputBaseFilename=Muffin_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
TranscribeVerb=Transcribe with Muffin

[Files]
; Never package a WebView2 browser profile: running the app from the publish
; folder leaves one there, its files churn while the compiler reads them, and
; it has no business in an installer.
Source: "{#AppFilesDir}\*"; DestDir: "{app}"; Excludes: "*.WebView2,*.WebView2\*"; Flags: ignoreversion recursesubdirs createallsubdirs

; What it takes to register the app as a package, which is what puts Muffin in
; Windows' Share sheet. An unpackaged app cannot be a Share Target; a loose
; folder registration gives it the identity it needs. These two lines are the
; whole payload for that: the manifest, and the tile logos it names.
;
; Registration itself is NOT automatic - Windows only accepts an unsigned one
; when Developer Mode is on, so it is a deliberate step, not something an
; installer should do behind a user's back. See pc.settings.shareRegister.
Source: "windows_app\PackageRegistration.AppxManifest.xml"; DestDir: "{app}"; DestName: "AppxManifest.xml"; Flags: ignoreversion
Source: "windows_app\Assets\*.png"; DestDir: "{app}\Assets"; Flags: ignoreversion

[Registry]
; "Transcribe with Muffin" on the right-click menu of every media type the app
; accepts, plus an Open with entry.
;
; This is how a file reaches Muffin from Explorer. The Package.appxmanifest
; declares a Windows Share Target, but Windows only registers one for an app
; with package identity, and this installs unpackaged - so that path has never
; fired in a shipped build. A shell verb needs no identity and no certificate.
;
; SystemFileAssociations, NOT the file type itself: this adds a verb without
; touching which app owns the extension, so installing Muffin cannot take .mp3
; away from whatever plays it. HKCU because PrivilegesRequired is lowest.
; uninsdeletekey on the verb removes it cleanly at uninstall.
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.opus\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.opus\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.opus\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp4\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp4\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp4\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mkv\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mkv\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mkv\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.aac\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.aac\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.aac\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.webm\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.webm\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.webm\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mov\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mov\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mov\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.avi\shell\MuffinTranscribe"; ValueType: string; ValueName: ""; ValueData: "{cm:TranscribeVerb}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.avi\shell\MuffinTranscribe"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.avi\shell\MuffinTranscribe\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

; Open with: registers the exe so Muffin appears in the list, again without
; claiming any extension as its own.
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#MyAppName}"
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mp3"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".wav"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".ogg"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".opus"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mp4"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mkv"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".m4a"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".aac"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".flac"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".webm"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mov"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".avi"; ValueData: ""

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: IsAutoUpdate

[Code]
var
  DownloadPage: TDownloadWizardPage;

function IsAutoUpdate: Boolean;
var
  i: Integer;
begin
  Result := False;
  for i := 1 to ParamCount do
  begin
    if CompareText(ParamStr(i), '/AUTOUPDATE') = 0 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), nil);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  ZipFile: String;
  ShellApp: Variant;
  ZipFolder: Variant;
  TargetFolder: Variant;
begin
  Result := True;
  
  if CurPageID = wpReady then begin
    if FileExists(ExpandConstant('{app}\ffmpeg_bin\ffmpeg.exe')) then begin
      Log('Engines already exist, skipping download.');
      Exit;
    end;

    DownloadPage.Clear;
    DownloadPage.Add('{#EnginesUrl}', 'muffin-engines.zip', '');
    DownloadPage.Show;
    
    try
      try
        DownloadPage.Download;
        ZipFile := ExpandConstant('{tmp}\muffin-engines.zip');
        
        DownloadPage.SetText('Extracting core engines...', '');
        DownloadPage.SetProgress(0, 0);
        
        { Ensure target dir exists }
        if not DirExists(ExpandConstant('{app}')) then
          CreateDir(ExpandConstant('{app}'));
          
        ShellApp := CreateOleObject('Shell.Application');
        ZipFolder := ShellApp.NameSpace(ZipFile);
        TargetFolder := ShellApp.NameSpace(ExpandConstant('{app}'));
        
        if not VarIsClear(TargetFolder) then
          TargetFolder.CopyHere(ZipFolder.Items, 4 or 16);
          
      except
        if DownloadPage.AbortedByUser then
          Log('Aborted by user.')
        else
          MsgBox('Dependency download failed: ' + GetExceptionMessage, mbError, MB_OK);
          
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end;
end;
