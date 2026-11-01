<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>You're invited to {{ config('app.name') }}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; color: #111827; margin: 0; padding: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding: 32px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);">
                    <tr>
                        <td>
                            <h1 style="margin: 0 0 16px; font-size: 24px;">You're invited to {{ config('app.name') }}</h1>
                            <p style="margin: 0 0 16px; line-height: 1.6;">Hi {{ $user->name ?? 'there' }},</p>
                            <p style="margin: 0 0 16px; line-height: 1.6;">
                                You've been added to a {{ config('app.name') }} workspace. To get started, please verify your email
                                and set a password for your account.
                            </p>
                            <p style="margin: 0 0 20px; line-height: 1.6;">
                                <a href="{{ $verificationUrl }}" style="color: #2563eb;">Verify your email</a>
                            </p>
                            <p style="margin: 0 0 20px; line-height: 1.6;">
                                <a href="{{ $resetUrl }}" style="color: #2563eb;">Set your password</a>
                            </p>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                                If you didn't expect this invitation, you can ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
