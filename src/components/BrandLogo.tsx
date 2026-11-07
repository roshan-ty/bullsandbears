import { logoLabel } from '../brand'
export function BrandLogo({ className = '' }: { className?: string }) {
  return <img className={`brand-logo ${className}`} src={`${import.meta.env.BASE_URL}brand-mark.png`} alt={logoLabel} width="56" height="56" draggable={false} />
}
