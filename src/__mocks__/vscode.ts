import { vi } from 'vitest';

export const Uri = {
	file: vi.fn((path: string) => ({
		fsPath: path,
		path,
		scheme: 'file',
		toString: () => `file://${path}`,
	})),
	parse: vi.fn((str: string) => ({
		fsPath: str.replace('file://', ''),
		path: str.replace('file://', ''),
		scheme: 'file',
		toString: () => str,
	})),
};

export const window = {
	activeTextEditor: undefined,
	showInformationMessage: vi.fn(),
	showWarningMessage: vi.fn(),
	showErrorMessage: vi.fn(),
	showQuickPick: vi.fn(),
	showInputBox: vi.fn(),
	withProgress: vi.fn((options, task) => task()),
	setStatusBarMessage: vi.fn(),
	createStatusBarItem: vi.fn(() => ({
		text: '',
		tooltip: '',
		command: '',
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	})),
	createOutputChannel: vi.fn(() => ({
		appendLine: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	})),
};

export const workspace = {
	openTextDocument: vi.fn(),
	applyEdit: vi.fn(),
	getConfiguration: vi.fn(() => ({
		get: vi.fn(),
		update: vi.fn(),
		has: vi.fn(),
	})),
	findFiles: vi.fn(),
	fs: {
		readFile: vi.fn(),
		stat: vi.fn(),
		writeFile: vi.fn(),
	},
	asRelativePath: vi.fn((pathOrUri) => {
		const p = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
		const root = workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (root && p.startsWith(root)) {
			const rel = p.slice(root.length);
			return rel.startsWith('/') ? rel.slice(1) : rel;
		}
		return p;
	}),
	createFileSystemWatcher: vi.fn(() => ({
		onDidCreate: vi.fn(),
		onDidDelete: vi.fn(),
		onDidChange: vi.fn(),
		dispose: vi.fn(),
	})),
	workspaceFolders: [
		{
			uri: Uri.file('/root/folder'),
			name: 'test-workspace',
			index: 0,
		},
	],
};

export const commands = {
	registerCommand: vi.fn(),
	executeCommand: vi.fn(),
};

export const env = {
	clipboard: {
		writeText: vi.fn(),
	},
};

export const ViewColumn = {
	Beside: 2,
};

export const StatusBarAlignment = {
	Left: 1,
	Right: 2,
};

export const ConfigurationTarget = {
	Global: 1,
	Workspace: 2,
	WorkspaceFolder: 3,
};

export class ThemeColor {
	constructor(public id: string) {}
}

export const Range = vi.fn();
export const WorkspaceEdit = vi.fn();

export class CancellationTokenSource {
	token = {
		isCancellationRequested: false,
		onCancellationRequested: vi.fn(),
	};
	cancel = vi.fn();
	dispose = vi.fn();
}

export const mockExtensionContext = {
	subscriptions: {
		push: vi.fn(),
	},
	extensionPath: '/test/extension/path',
	globalState: {
		get: vi.fn(),
		update: vi.fn(),
	},
	workspaceState: {
		get: vi.fn(),
		update: vi.fn(),
	},
	secrets: {
		get: vi.fn(),
		store: vi.fn(),
		delete: vi.fn(),
	},
};
