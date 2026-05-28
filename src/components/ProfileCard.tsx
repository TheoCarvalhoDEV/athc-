import { useNavigate } from 'react-router-dom';
import type { AppProfile } from '../lib/storage';
import { Building2, Users } from 'lucide-react';

export const ProfileCard = ({ profile }: { profile: AppProfile }) => {
  const navigate = useNavigate();
  
  return (
    <div 
      onClick={() => navigate(`/agenda/${profile.id}`)}
      className="glass rounded-3xl p-4 flex items-center gap-4 cursor-pointer hover:-translate-y-1 hover:border-accent/40 hover:shadow-glow-accent transition-all duration-300 mb-4"
    >
      <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0 border border-accent/20 shadow-[0_0_10px_rgba(0,240,255,0.1)] overflow-hidden">
        {profile.imageUrl ? (
          <img src={profile.imageUrl} alt={profile.name} className="w-full h-full object-cover" />
        ) : profile.type === 'atletica' ? (
           <Users className="text-accent" size={24} />
        ) : (
           <Building2 className="text-accent" size={24} />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-display font-bold text-base text-textLight truncate">{profile.name}</h3>
        <span className="font-mono text-[9px] text-accent bg-accent/10 px-2.5 py-0.5 border border-accent/20 font-bold uppercase tracking-wider rounded-full inline-block mt-1">
          {profile.type}
        </span>
        {profile.description && (
          <p className="text-xs text-textMuted truncate mt-1.5">{profile.description}</p>
        )}
      </div>
    </div>
  );
};
