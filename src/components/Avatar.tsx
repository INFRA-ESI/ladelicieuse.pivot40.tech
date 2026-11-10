import { cn } from '@/lib/utils';
import type { User } from '@/context/UserContext';

// Photo de profil, ou les initiales quand il n'y en a pas.
export default function Avatar({ user, className, textClassName }: {
  user: Pick<User, 'prenoms' | 'nom' | 'avatar'>;
  className?: string;
  textClassName?: string;
}) {
  const initials = [(user.prenoms || '')[0], (user.nom || '')[0]].filter(Boolean).join('').toUpperCase();
  return (
    <span className={cn('rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden shrink-0', className)}>
      {user.avatar
        ? <img src={user.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
        : <span className={cn('font-display', textClassName)}>{initials}</span>}
    </span>
  );
}
