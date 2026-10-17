-- ============================================================================
-- Nome e telefone do usuário (guardados em auth.users.raw_user_meta_data).
-- admin_list_users passa a devolver name/phone. Troca a assinatura -> DROP+CREATE.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (user_id uuid, email text, name text, phone text, role text, location_ids uuid[], created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id, u.email::text,
         (u.raw_user_meta_data->>'name')::text AS name,
         (u.raw_user_meta_data->>'phone')::text AS phone,
         COALESCE(r.role, 'visualizador') AS role,
         COALESCE(array_agg(ul.location_id) FILTER (WHERE ul.location_id IS NOT NULL), '{}') AS location_ids,
         u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  LEFT JOIN public.user_locations ul ON ul.user_id = u.id
  WHERE public.is_admin()
  GROUP BY u.id, u.email, u.raw_user_meta_data, r.role, u.created_at
  ORDER BY u.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
