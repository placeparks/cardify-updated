-- Test SQL to debug upload counting issue
-- This simulates the scenario where a user has deleted an upload and can't use their last remaining upload

-- Example scenario:
-- User has package_count = 1 (25 uploads allowed)
-- User has upload_count = 24 (24 uploads used)
-- User should have 1 upload remaining (25 - 24 = 1)
-- But system might be blocking them

-- Test the get_user_upload_status function with different scenarios
DO $$
DECLARE
    test_result RECORD;
    test_user_id UUID := gen_random_uuid();
BEGIN
    -- Create test profile with specific upload counts
    INSERT INTO profiles (id, upload_count, upload_package_count, credits)
    VALUES
        -- Test case 1: User with 24 uploads out of 25 (should have 1 remaining)
        (test_user_id, 24, 1, 100);

    -- Check upload status
    SELECT * INTO test_result FROM get_user_upload_status(test_user_id);
    RAISE NOTICE 'Test case 1 (24/25 uploads): upload_count=%, package_count=%, remaining=%, message=%',
        test_result.upload_count, test_result.upload_package_count,
        test_result.remaining_uploads, test_result.message;

    -- Update to 25 uploads (should have 0 remaining)
    UPDATE profiles SET upload_count = 25 WHERE id = test_user_id;
    SELECT * INTO test_result FROM get_user_upload_status(test_user_id);
    RAISE NOTICE 'Test case 2 (25/25 uploads): upload_count=%, package_count=%, remaining=%, message=%',
        test_result.upload_count, test_result.upload_package_count,
        test_result.remaining_uploads, test_result.message;

    -- Clean up
    DELETE FROM profiles WHERE id = test_user_id;
END $$;

-- Check the actual function logic for calculation errors
SELECT
    upload_count,
    upload_package_count,
    CASE
        WHEN upload_package_count = 0 THEN 0
        WHEN upload_package_count = 1 THEN 25 - upload_count  -- First package: 25 uploads
        ELSE 25 + ((upload_package_count - 1) * 10) - upload_count  -- Additional packages: 10 each
    END as calculated_remaining,
    credits
FROM profiles
WHERE upload_count > 0
ORDER BY upload_count DESC
LIMIT 10;