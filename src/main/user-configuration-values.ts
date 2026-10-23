import { UserConfigurationError } from "./user-configuration-error";

// Value checks for config.json fields. Each throws a UserConfigurationError
// naming the field, which the loader turns into its precise diagnostic.
export function requireObject(
  value: unknown,
  configurationPath: string,
  location: string,
  expected: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(configurationPath, location, `must be ${expected}`);
  return value as Record<string, unknown>;
}

export function optionalObject(
  value: unknown,
  configurationPath: string,
  location: string,
): Record<string, unknown> | undefined {
  return value === undefined
    ? undefined
    : requireObject(value, configurationPath, location, "an object");
}

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  configurationPath: string,
  location: string,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    fail(configurationPath, `${location}.${unknown}`, "is unknown");
}

export function integerInRange(
  value: unknown,
  configurationPath: string,
  location: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value) || !Number.isInteger(value))
    fail(configurationPath, location, "must be a finite integer");
  if ((value as number) < minimum || (value as number) > maximum)
    fail(
      configurationPath,
      location,
      `must be from ${minimum} through ${maximum}`,
    );
  return value as number;
}

export function numberInRange(
  value: unknown,
  configurationPath: string,
  location: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(configurationPath, location, "must be a finite number");
  if (value < minimum || value > maximum)
    fail(
      configurationPath,
      location,
      `must be from ${minimum} through ${maximum}`,
    );
  return value;
}

export function optionalBoolean(
  value: unknown,
  configurationPath: string,
  location: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean")
    fail(configurationPath, location, "must be a boolean");
  return value;
}

export function optionalEnum<const Values extends readonly string[]>(
  value: unknown,
  configurationPath: string,
  location: string,
  values: Values,
  defaultValue: Values[number],
): Values[number] {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !values.includes(value))
    fail(configurationPath, location, `must be ${values.join(", ")}`);
  return value as Values[number];
}

export function fail(
  configurationPath: string,
  location: string | undefined,
  reason: string,
): never {
  throw new UserConfigurationError(configurationPath, location, reason);
}
