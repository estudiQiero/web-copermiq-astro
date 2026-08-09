-- Copermiq — notas de admin sobre usuarios (tabla propia de la web)
--
-- Esta tabla es de la web, no la toca ni la necesita la app para nada:
-- guarda una nota libre por usuario, para que el admin (Miq) pueda
-- anotar lo que quiera para identificar cuentas en la tabla de
-- /cuenta. A propósito, NO tiene ninguna referencia (foreign key) a
-- `profiles` — así, si alguna vez se borra un usuario con
-- admin-delete-user (función de la app), esa operación no se ve
-- afectada por esta tabla en absoluto; la nota huérfana que pueda
-- quedar no genera ningún error, simplemente no se vuelve a mostrar.
--
-- SÍ ejecutar esto contra el proyecto real de Supabase (a diferencia de
-- otras migraciones de este repo, marcadas "no ejecutar") — es nueva,
-- propia de la web, sin ningún efecto sobre lo que gestiona la app.

create table if not exists admin_user_notes (
  user_id uuid primary key,
  note text,
  updated_at timestamptz not null default now()
);

alter table admin_user_notes enable row level security;

-- Solo un administrador (profiles.is_admin = true) puede leer o escribir
-- notas — de cualquier usuario, no solo la suya. No hay política para
-- usuarios normales: no ven ni necesitan ver esta tabla.
create policy "admins pueden leer notas"
  on admin_user_notes for select
  using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.is_admin = true
    )
  );

create policy "admins pueden crear notas"
  on admin_user_notes for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.is_admin = true
    )
  );

create policy "admins pueden actualizar notas"
  on admin_user_notes for update
  using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.is_admin = true
    )
  );
