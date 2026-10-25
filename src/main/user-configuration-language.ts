import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../shared/i18n";
import { UserConfigurationError } from "./user-configuration-error";

// The single language for application-owned UI and menus. Omitted means
// en-US; OMXTerm never infers it from the system.
export function validateLanguage(
  value: unknown,
  configurationPath: string,
): SupportedLanguage {
  if (value === undefined) return DEFAULT_LANGUAGE;
  if (!isSupportedLanguage(value))
    throw new UserConfigurationError(
      configurationPath,
      "language",
      `must be ${SUPPORTED_LANGUAGES.join(", ")}`,
    );
  return value;
}
