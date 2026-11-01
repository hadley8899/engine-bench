<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welcome to {{ config('app.name') }}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; color: #111827; margin: 0; padding: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding: 32px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);">
                    <tr>
                        <td>
                            <h1 style="margin: 0 0 16px; font-size: 24px;">Welcome to {{ config('app.name') }}</h1>
                            <p style="margin: 0 0 16px; line-height: 1.6;">Hi {{ $user->name ?? 'there' }},</p>
                            <p style="margin: 0 0 16px; line-height: 1.6;">
                                Thanks for verifying your email. Your {{ config('app.name') }} account is ready.
                                Your workspace is ready to use.
                            </p>
                            <p style="margin: 0 0 24px; line-height: 1.6;">
                                If you need help getting started, reply to this email and we will jump in.
                            </p>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                                - The {{ config('app.name') }} team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
