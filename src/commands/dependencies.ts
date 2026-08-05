import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';

/**
 * The services every command receives.
 *
 * Declared in its own module so the command and the modules it delegates to
 * (output routing, clipboard) can share the shape without importing each
 * other.
 */
export interface CommandDependencies {
	readonly telemetry: Telemetry;
	readonly notifier: Notifier;
	readonly statusBar: StatusBar;
}
