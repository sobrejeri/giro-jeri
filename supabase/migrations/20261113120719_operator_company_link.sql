-- Rascunho para o vínculo: não aplicar antes da integração de recebimentos,
-- das políticas RLS e dos testes de histórico e isolamento entre empresas.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS company_role public.user_type
    GENERATED ALWAYS AS ('company'::public.user_type) STORED;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_user_type_unique UNIQUE (id, user_type),
  ADD CONSTRAINT users_company_only_for_operator
    CHECK (company_id IS NULL OR user_type = 'operator'),
  ADD CONSTRAINT users_company_must_be_company
    FOREIGN KEY (company_id, company_role) REFERENCES public.users (id, user_type);

CREATE INDEX users_company_id_idx ON public.users (company_id) WHERE company_id IS NOT NULL;
