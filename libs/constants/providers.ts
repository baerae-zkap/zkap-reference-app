export const SUPPORTED_SOCIAL_PROVIDERS = ['google'] as const;
export type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];

export function isSupportedProvider(provider: string): provider is SupportedSocialProvider {
  return (SUPPORTED_SOCIAL_PROVIDERS as readonly string[]).includes(provider);
}
