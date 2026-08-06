"""add media_key/thumbnail_key to group_messages and backfill from presigned URLs

O que estava gravado em `media_url` era uma presigned URL com validade de uma
hora — dado que caduca. Passa a valer a chave do objeto (`media/{group_id}/…`),
e a URL é resolvida na serialização.

O backfill extrai a chave das URLs existentes e limpa `media_url`/`thumbnail_url`
nas linhas migradas. `media_url` continua preenchido para `video_link`, que
guarda link externo legítimo.

Assimétrica por natureza: o downgrade só derruba as colunas. Reconstruir as
URLs antigas não faria sentido — elas já estão expiradas.

Revision ID: 0023
Revises: 0022
Create Date: 2026-08-06
"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("group_messages", sa.Column("media_key", sa.Text(), nullable=True))
    op.add_column("group_messages", sa.Column("thumbnail_key", sa.Text(), nullable=True))

    # ── Backfill ─────────────────────────────────────────────────────────────
    # A chave é o trecho a partir de "media/{group_id}/" até antes da querystring.
    # O host varia (MinIO em dev, R2 em prod), então a extração é por regex — mas
    # o `group_id` da própria linha entra no padrão, e isso não é detalhe.
    #
    # `media_url` vinha do cliente sem validação de origem — é metade do que esta
    # migration existe para consertar. Um padrão frouxo como 'media/[^?]+' aceita
    # o que estiver ali:
    #
    #   'https://terceiro.com/media/gato.jpg'  → media_key 'media/gato.jpg'
    #   → chave que não existe no nosso bucket, e a URL original apagada logo
    #     abaixo. Perda de dado, e a imagem passa de hotlink que carregava para
    #     404 permanente.
    #
    #   '…/media/{outro_group_id}/x.webp'      → media_key de outro clube
    #   → a mensagem passa a servir objeto de um grupo alheio. O código novo
    #     valida isso na escrita; sem o group_id aqui, o backfill entraria pela
    #     porta que a validação fechou.
    #
    # Exigindo `media/{group_id}/`, os dois casos não casam, `media_key` fica
    # NULL, `media_url` é preservado, e `_resolve_media_url` continua devolvendo
    # a URL antiga como faz para `video_link`. Linha suspeita fica como está, para
    # ser olhada por gente — não convertida em chave inválida em silêncio.
    op.execute(
        """
        UPDATE group_messages
        SET media_key = substring(media_url from 'media/' || group_id::text || '/[^?]+')
        WHERE media_url IS NOT NULL
          AND media_url LIKE '%/media/' || group_id::text || '/%'
          AND content_type IN ('image', 'gif')
        """
    )
    op.execute(
        """
        UPDATE group_messages
        SET thumbnail_key = substring(thumbnail_url from 'media/' || group_id::text || '/[^?]+')
        WHERE thumbnail_url IS NOT NULL
          AND thumbnail_url LIKE '%/media/' || group_id::text || '/%'
        """
    )

    # Nenhuma presigned URL fica para trás nas linhas migradas. As não migradas
    # mantêm `media_url` de propósito — é o fallback de `_resolve_media_url`.
    op.execute("UPDATE group_messages SET media_url = NULL WHERE media_key IS NOT NULL")
    op.execute("UPDATE group_messages SET thumbnail_url = NULL WHERE thumbnail_key IS NOT NULL")


def downgrade() -> None:
    op.drop_column("group_messages", "thumbnail_key")
    op.drop_column("group_messages", "media_key")
