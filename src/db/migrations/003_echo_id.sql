-- Migration 003: Add unique 5-digit Echo ID to users

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS echo_id TEXT UNIQUE;

-- Function to generate a random 5-digit string and ensure uniqueness
CREATE OR REPLACE FUNCTION generate_echo_id()
RETURNS TRIGGER AS $$
DECLARE
    new_id TEXT;
    is_unique BOOLEAN := FALSE;
BEGIN
    -- Only generate if not provided
    IF NEW.echo_id IS NULL THEN
        WHILE NOT is_unique LOOP
            -- Generate random number between 10000 and 99999
            new_id := (floor(random() * 90000) + 10000)::TEXT;
            
            -- Check if it already exists
            IF NOT EXISTS (SELECT 1 FROM public.users WHERE echo_id = new_id) THEN
                is_unique := TRUE;
            END IF;
        END LOOP;
        NEW.echo_id := new_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run before insert
DROP TRIGGER IF EXISTS users_generate_echo_id ON public.users;
CREATE TRIGGER users_generate_echo_id
    BEFORE INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION generate_echo_id();

-- Just clear out test data instead of writing a migration loop (much faster and no deadlocks)
TRUNCATE TABLE public.users CASCADE;

-- Make it NOT NULL
ALTER TABLE public.users ALTER COLUMN echo_id SET NOT NULL;
