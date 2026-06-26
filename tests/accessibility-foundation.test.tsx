import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/components/ui/Button';
import { ModalDialog } from '../src/components/ui/Dialog';
import { TextField } from '../src/components/ui/Field';
import { Sheet } from '../src/components/ui/Sheet';

describe('accessibility foundation', () => {
  it('associates field labels, hints, errors, and invalid state', () => {
    const { rerender } = render(
      <TextField
        id="business-name"
        label="Business name"
        hint="Use the public name shown by the business."
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Business name' });
    expect(input).toHaveAttribute('aria-describedby', 'business-name-hint');
    expect(screen.getByText('Use the public name shown by the business.')).toHaveAttribute(
      'id',
      'business-name-hint',
    );

    rerender(
      <TextField id="business-name" label="Business name" error="Business name is required." />,
    );

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'business-name-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Business name is required.');
  });

  it('exposes dialog title, description, and close control', async () => {
    const user = userEvent.setup();

    render(
      <ModalDialog
        trigger={<Button>Open evidence</Button>}
        title="Evidence summary"
        description="Review the source before relying on this listing."
      >
        <p>Official merchant payment page.</p>
      </ModalDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Open evidence' }));

    const dialog = screen.getByRole('dialog', { name: 'Evidence summary' });
    expect(dialog).toHaveAccessibleDescription('Review the source before relying on this listing.');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes sheet title, description, and close control', async () => {
    const user = userEvent.setup();

    render(
      <Sheet
        trigger={<Button>Open place details</Button>}
        title="Place details"
        description="Review payment instructions for the selected place."
      >
        <p>Bitcoin Lightning is confirmed.</p>
      </Sheet>,
    );

    await user.click(screen.getByRole('button', { name: 'Open place details' }));

    const dialog = screen.getByRole('dialog', { name: 'Place details' });
    expect(dialog).toHaveAccessibleDescription(
      'Review payment instructions for the selected place.',
    );
    expect(screen.getByRole('button', { name: 'Close sheet' })).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
