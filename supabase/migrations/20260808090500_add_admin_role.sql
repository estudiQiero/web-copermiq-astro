-- Copermiq — rol de administrador
--
-- Añade una columna `role` a profiles para poder marcar a un usuario como
-- administrador. De momento solo se usa para mostrar/ocultar el panel de
-- administración en la web (y, más adelante, en la app): la píldora
-- "Admin" en /cuenta solo aparece si role = 'admin'.
--
-- No hay ningún flujo automático que convierta a alguien en admin — se
-- hace a mano en la base de datos:
--
--   update public.profiles set role = 'admin' where id = '<uuid del usuario>';
--
-- (para encontrar el uuid: select id from auth.users where email = '...';)
--
-- Cómo aplicar esta migración: igual que la anterior, `supabase db push`
-- o pegarla tal cual en el SQL Editor del panel de Supabase.

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));

comment on column public.profiles.role is
  'Rol dentro de Copermiq: "user" (por defecto) o "admin". Los admins ven el panel de administración en /cuenta. Se asigna a mano en la base de datos, no hay flujo de autoservicio.';
