import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  value: {
    user: null,
    isLoading: false,
    logout: vi.fn(),
    login: vi.fn(),
    requestPasswordResetCode: vi.fn().mockResolvedValue('Code sent'),
    verifyPasswordResetCode: vi.fn().mockResolvedValue('reset-token'),
    resetPassword: vi.fn().mockResolvedValue('Password changed'),
    requestReaderRegistrationCode: vi.fn(),
    verifyReaderRegistrationCode: vi.fn(),
    registerReader: vi.fn()
  }
}));

vi.mock('@/contexts/StoryAuthContext', () => ({
  useStoryAuth: () => auth.value
}));

import { ReaderAuthPage } from '@/pages/stories/StoryPlatform';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function submitForm() {
  const form = container?.querySelector('form');
  if (!form) throw new Error('Authentication form was not rendered.');
  await act(async () => Simulate.submit(form));
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.value = value;
    Simulate.change(input);
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
  auth.value.requestPasswordResetCode.mockResolvedValue('Code sent');
  auth.value.verifyPasswordResetCode.mockResolvedValue('reset-token');
  auth.value.resetPassword.mockResolvedValue('Password changed');
});

describe('reader password reset form', () => {
  it('shows both new-password fields after verification and rejects mismatches', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <MemoryRouter initialEntries={['/en/login']}>
        <Routes>
          <Route path="/:locale/login" element={<ReaderAuthPage mode="login" />} />
        </Routes>
      </MemoryRouter>
    ));

    const forgotPassword = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Forgot your password?'));
    expect(forgotPassword).toBeTruthy();
    await act(async () => forgotPassword?.click());

    await changeInput(container.querySelector<HTMLInputElement>('input[type="email"]')!, 'reader@example.test');
    await submitForm();
    await changeInput(container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!, '123456');
    await submitForm();

    let passwordFields = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    expect(passwordFields).toHaveLength(2);
    await changeInput(passwordFields[0], 'new-secure-password');
    await changeInput(passwordFields[1], 'different-password');
    await submitForm();
    expect(auth.value.resetPassword).not.toHaveBeenCalled();

    passwordFields = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await changeInput(passwordFields[1], 'new-secure-password');
    await submitForm();
    expect(auth.value.resetPassword).toHaveBeenCalledWith(
      'reader@example.test',
      'new-secure-password',
      'reset-token',
      'reader'
    );
  });
});
