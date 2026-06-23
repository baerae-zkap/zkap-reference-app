import { ComponentProps, PropsWithChildren, useState } from 'react';
import { SocialButton } from './SocialButton';
import { googleSignIn } from '@/services/auth/googleAuth';
import { GoogleIcon } from '@/components/icons/SocialIcons';

type GoogleSignInButtonProps = {
  onSuccess?: (data: { idToken: string; userName: string; email: string }) => void;
  onError?: (error: unknown) => void;
  isLoading?: boolean;
  forceAccountSelection?: boolean;
} & Omit<ComponentProps<typeof SocialButton>, 'icon' | 'backgroundColor'>;

export function GoogleSignInButton({
  onSuccess,
  onError,
  isLoading: externalLoading,
  forceAccountSelection = true,
  children,
  ...props
}: PropsWithChildren<GoogleSignInButtonProps>) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePress = async () => {
    try {
      setIsLoading(true);
      const { idToken, userName, email } = await googleSignIn({ forceAccountSelection });
      onSuccess?.({ idToken, userName, email });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isCancelled = msg.includes('cancelled') || msg.includes('canceled');
      if (!isCancelled) {
        console.error('Google Sign-In error:', error);
        onError?.(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SocialButton
      icon={<GoogleIcon />}
      backgroundColor="#FFFFFF"
      color="#3C4043"
      borderWidth={1}
      borderColor="#DADCE0"
      isLoading={isLoading || externalLoading}
      onPress={handlePress}
      {...props}
    >
      {children}
    </SocialButton>
  );
}
