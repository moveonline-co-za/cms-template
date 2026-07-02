import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { Resend } from 'resend';

import { getEnvVar } from '../utils/env';

export const server = {
  sendContactEmail: defineAction({
    accept: 'json',
    input: z.object({
      email: z.string().email(),
      message: z.string().min(5),
    }),
    handler: async (input) => {
      const resendApiKey = await getEnvVar('RESEND_API_KEY');
      if (!resendApiKey) {
        throw new Error('Missing Resend API credentials configuration binding.');
      }

      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send({
        from: 'Template Canary <onboarding@resend.dev>',
        to: ['delivered@example.com'],
        subject: 'Canary Contact Form Submission Flight',
        text: `Sender: ${input.email}\n\nPayload: ${input.message}`,
      });

      if (error) return { success: false, error };
      return { success: true, id: data?.id };
    },
  }),
};
