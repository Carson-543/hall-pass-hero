-- Add is_queue_autonomous column to classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS is_queue_autonomous BOOLEAN DEFAULT false;

-- Function to check and auto-approve the next student in the queue
CREATE OR REPLACE FUNCTION auto_approve_next_in_queue()
RETURNS TRIGGER AS $$
DECLARE
    limit_val INTEGER;
    current_active INTEGER;
    next_pass_id UUID;
    is_autonomous BOOLEAN;
BEGIN
    -- Check if the class is set to autonomous
    SELECT is_queue_autonomous, COALESCE(max_concurrent_bathroom, 2)
    INTO is_autonomous, limit_val
    FROM classes
    WHERE id = NEW.class_id;

    IF is_autonomous IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Count currently active passes for this class (approved or pending_return)
    -- We only care about Bathroom passes for now as that's usually what the queue is for,
    -- but usually the limit applies to all or bathroom specifically. 
    -- The prompt said "max concurrent passes from that teacher". 
    -- Let's stick to 'Restroom' based on context of context 'max_concurrent_bathroom'.
    SELECT COUNT(*)
    INTO current_active
    FROM passes
    WHERE class_id = NEW.class_id
    AND destination = 'Restroom'
    AND status IN ('approved', 'pending_return');

    -- If there is space
    IF current_active < limit_val THEN
        -- Find the oldest pending request for this class
        SELECT id INTO next_pass_id
        FROM passes
        WHERE class_id = NEW.class_id
        AND destination = 'Restroom'
        AND status = 'pending'
        ORDER BY requested_at ASC
        LIMIT 1;

        -- Approve it
        IF next_pass_id IS NOT NULL THEN
            UPDATE passes
            SET status = 'approved',
                approved_at = NOW(),
                approved_by = (SELECT teacher_id FROM classes WHERE id = NEW.class_id) -- System or Teacher? Use Teacher ID for record
            WHERE id = next_pass_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: When a pass is returned (student comes back), check if we can approve next
CREATE OR REPLACE TRIGGER on_pass_returned_auto_queue
AFTER UPDATE OF status ON passes
FOR EACH ROW
WHEN (OLD.status IN ('approved', 'pending_return') AND NEW.status = 'returned')
EXECUTE FUNCTION auto_approve_next_in_queue();

-- Trigger: When a new pass is requested, check if it can be approved immediately
CREATE OR REPLACE FUNCTION auto_approve_on_request()
RETURNS TRIGGER AS $$
DECLARE
    limit_val INTEGER;
    current_active INTEGER;
    is_autonomous BOOLEAN;
BEGIN
    -- Check if the class is set to autonomous
    SELECT is_queue_autonomous, COALESCE(max_concurrent_bathroom, 2)
    INTO is_autonomous, limit_val
    FROM classes
    WHERE id = NEW.class_id;

    IF is_autonomous IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Only applies to pending requests (which is what inserts usually are)
    IF NEW.status != 'pending' OR NEW.destination != 'Restroom' THEN
        RETURN NEW;
    END IF;

    -- Count currently active
    SELECT COUNT(*)
    INTO current_active
    FROM passes
    WHERE class_id = NEW.class_id
    AND destination = 'Restroom'
    AND status IN ('approved', 'pending_return');

    -- If space, auto approve THIS request immediately
    IF current_active < limit_val THEN
        NEW.status := 'approved';
        NEW.approved_at := NOW();
        -- We might need approved_by. We can leave it null (system) or fetch teacher.
        -- Let's fetch teacher for consistency if possible, or leave null.
        NEW.approved_by := (SELECT teacher_id FROM classes WHERE id = NEW.class_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_pass_requested_auto_queue
BEFORE INSERT ON passes
FOR EACH ROW
EXECUTE FUNCTION auto_approve_on_request();
