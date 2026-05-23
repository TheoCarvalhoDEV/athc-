import { useNavigate } from 'react-router-dom';
import type { AppProfile } from '../lib/storage';
import { Building2, Users } from 'lucide-react';

export const ProfileCard = ({ profile }: { profile: AppProfile }) => {
  const navigate = useNavigate();
  
  return (
    <div 
      onClick={() => navigate(`/agenda/${profile.id}`)}
      className="bg-background border border-primary/20 rounded-[1.5rem] p-4 flex items-center gap-4 cursor-pointer hover:bg-primary/5 transition-colors mb-4 shadow-sm"
    >
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border-2 border-primary/20">
        {profile.type === 'atletica' ? (
           <Users className="text-primary" size={24} />
        ) : (
           <Building2 className="text-primary" size={24} />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-sans font-bold text-base text-textDark truncate">{profile.name}</h3>
        <p className="font-mono text-xs text-primary font-bold uppercase tracking-wider">{profile.type}</p>
        {profile.description && (
          <p className="text-xs text-textDark/60 truncate mt-1">{profile.description}</p>
        )}
      </div>
    </div>
  );
};
