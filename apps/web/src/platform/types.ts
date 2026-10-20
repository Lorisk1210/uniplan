/** Things the native menus of the desktop app can ask the interface to do. */
export type MenuAction =
  | 'new-course' | 'new-semester' | 'edit-semester' | 'overview' | 'requirements'
  | 'import' | 'export' | 'export-ics' | 'print' | 'undo' | 'redo' | 'prev-semester' | 'next-semester';

export interface LoadResult {
  /** Parsed JSON as stored, or null if there's nothing yet. */
  raw: unknown;
  /** Shown to the user, e.g. when unreadable data was set aside. */
  notice?: string;
}

export interface ExportFile {
  name: string;
  content: string;
  mime: string;
}

/** Everything that differs between the browser, the desktop app and the phone app. */
export interface Platform {
  kind: 'browser' | 'desktop' | 'mobile';
  os: 'mac' | 'linux' | 'windows' | 'ios' | 'android' | 'other';
  load(): Promise<LoadResult>;
  save(json: string): Promise<void>;
  /** Last-chance synchronous save while the page is closing. */
  flush?(json: string): void;
  /** Resolves false if the user cancelled. */
  exportFile(file: ExportFile): Promise<boolean>;
  /** A native picker for a backup to import; resolves to its text, or null if cancelled. Without it, a file input is used. */
  openFile?(): Promise<string | null>;
  /** Where the data lives, shown in the menu. */
  dataLocation?: string;
  revealData?(): void;
  onMenu?(cb: (action: MenuAction) => void): void;
  /** The app menu owns Cmd/Ctrl+Z, so the page mustn't handle it too. */
  nativeUndo?: boolean;
  /** Match the phone's status bar to the app's theme. */
  setDarkMode?(dark: boolean): void;
  /** Android's back button. The handler returns false when there's nothing left to go back from. */
  onBackButton?(handler: () => boolean): void;
  canPrint: boolean;
}
