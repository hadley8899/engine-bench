<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class WelcomeEmail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(public readonly User $user) {}

    public function build(): self
    {
        return $this->subject('Welcome to '.config('app.name'))
            ->view('emails.welcome');
    }
}
