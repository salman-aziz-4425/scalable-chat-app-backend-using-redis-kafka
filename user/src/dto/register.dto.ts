import { z } from 'zod';

export const UserRegisterSchema=z.object({
    email: z.string().email(),
    password: z.string().min(6),
})

export type RegisterDto = z.infer<typeof UserRegisterSchema>;