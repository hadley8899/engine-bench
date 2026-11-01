<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserInviteEmail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $verificationUrl,
        public readonly string $resetUrl,
    ) {}

    public function build(): self
    {
        return $this->subject('You are invited to '.config('app.name'))
            ->view('emails.user-invite');
    }
}
