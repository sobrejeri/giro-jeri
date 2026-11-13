-- Permite cadastrar a função empresa; acesso operacional permanece separado.
ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'company';
