-- Non-destructive emergency stop. Existing accumulated session history remains.
begin;

update private.study_cafe_agents set enabled = false;
select private.run_study_cafe_agents(now());

commit;

-- Resume later with:
-- update private.study_cafe_agents set enabled = true;
