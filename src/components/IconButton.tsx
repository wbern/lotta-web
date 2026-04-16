import type { ButtonHTMLAttributes } from 'react'

export function IconButton({
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = className ? `btn btn-small btn-icon ${className}` : 'btn btn-small btn-icon'
  return <button type={type} className={classes} {...rest} />
}
