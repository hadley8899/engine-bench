import { IconButton, InputAdornment, TextField } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { useState } from 'react'

type PasswordFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  name?: string
  autoComplete?: string
}

export const PasswordField = ({ label, value, onChange, name, autoComplete }: PasswordFieldProps) => {
  const [show, setShow] = useState(false)

  return (
    <TextField
      label={label}
      name={name}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      fullWidth
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label="toggle password visibility" onClick={() => setShow((prev) => !prev)}>
              {show ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  )
}
