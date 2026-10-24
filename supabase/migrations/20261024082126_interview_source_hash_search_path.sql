-- Pin built-in function resolution; preserve hashes, privileges, and saved content.
alter function public.ip_ai_source_hash(jsonb) set search_path = '';
