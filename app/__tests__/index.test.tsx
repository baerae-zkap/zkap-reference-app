import { render } from '@testing-library/react-native';
import Index from '../index';

describe('Index (Splash Screen)', () => {
  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { root } = render(<Index />);
      expect(root).toBeTruthy();
    });

    it('renders an empty View', () => {
      const { toJSON } = render(<Index />);
      const tree = toJSON();
      expect(tree).not.toBeNull();
      expect((tree as any).type).toBe('View');
    });
  });

  describe('Navigation Logic', () => {
    // TODO: Add tests when auth state checking is implemented
    it.todo('redirects to home when authenticated with wallet');
    it.todo('redirects to wallet setup when authenticated without wallet');
    it.todo('redirects to sign-in when not authenticated');
  });
});
