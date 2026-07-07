import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacesMap } from '../src/components/places/PlacesMap';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PlacesMap responsive layout', () => {
  it('uses dynamic mobile viewport height without a fixed mobile minimum', () => {
    vi.stubGlobal('WebGLRenderingContext', undefined);

    const { container } = render(
      <PlacesMap
        pins={[]}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass('h-[calc(100dvh-13rem)]');
    expect(root).toHaveClass('min-h-0');
    expect(root).toHaveClass('lg:min-h-[38rem]');
    expect(root).not.toHaveClass('min-h-[28rem]');
  });
});
