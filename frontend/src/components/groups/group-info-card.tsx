import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupInfoCardProps {
  group: GroupDetailResponse;
}

/**
 * As informações do clube em leitura, para quem não é admin.
 *
 * Nome, foto e descrição só existiam dentro do `GroupInfoForm`, que é do
 * admin — então a descrição do clube não aparecia em lugar nenhum do app para
 * o membro comum. Ver não é alterar: mesma informação, sem campo nenhum.
 */
export function GroupInfoCard({ group }: GroupInfoCardProps) {
  return (
    <section className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4">
      <h3 className="font-semibold">Informações do clube</h3>

      <div className="flex items-center gap-4">
        <Avatar size="lg">
          {group.photo_url && (
            <AvatarImage src={group.photo_url} alt={group.name} />
          )}
          <AvatarFallback className="bg-sage-100 text-sage-700 font-display font-bold text-lg dark:bg-sage-800 dark:text-sage-200">
            {group.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 font-display text-lg font-bold tracking-tight">
          {group.name}
        </p>
      </div>

      {/* Um clube sem descrição vira um card mudo se a linha simplesmente
          some — o membro fica sem saber se não há descrição ou se ela não
          carregou. */}
      {group.description ? (
        <p className="type-body whitespace-pre-wrap text-muted-foreground">
          {group.description}
        </p>
      ) : (
        <p className="type-body italic text-muted-foreground">Sem descrição.</p>
      )}
    </section>
  );
}
