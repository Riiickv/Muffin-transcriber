#define MyAppName "Muffin Transcriber"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Muffin Open Source"
#define MyAppExeName "MuffinTranscriber.exe"

; EDIT THIS URL TO POINT TO YOUR GITHUB RELEASE!
#define EnginesUrl "https://github.com/Riiickv/Muffin-transcriber/releases/download/v1.0.0/muffin-engines.zip"

[Setup]
AppId={{8B841A83-F1C5-4845-9892-069E6E9222B5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=C:\Users\ricky\Desktop
OutputBaseFilename=Muffin_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "C:\Users\ricky\Desktop\AITranscriber_Release\app_files\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

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
begin
  Result := CmdLineParamExists('/AUTOUPDATE');
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
    if FileExists(ExpandConstant('{app}\ffmpeg.exe')) then begin
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
