// Build-time test doubles only. Never included in the shipped plugin.
export function Injectable (_options?: unknown): ClassDecorator { return () => {} }
export class NgZone { run<T>(fn:()=>T):T { return fn() } }
export class AppService {}
export class BaseTabComponent {}
export class SplitTabComponent {}
export class BaseTerminalTabComponent {}
export class ConfigService {}
export class NotificationsService {}
export class ProfilesService {}
export class PlatformService {}
