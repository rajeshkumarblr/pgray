SELECT 
    m.name, 
    m.date
FROM movies m
JOIN casts c ON m.id = c.movie_id
JOIN people p ON c.person_id = p.id
JOIN job_names j ON c.job_id = j.job_id
WHERE 
    p.name IN ('Tom Hanks', 'Meg Ryan')  -- 1. Filter for both names
    AND j.name IN ('Actor', 'Actress')   -- 2. STRICTLY filter for Acting roles
GROUP BY 
    m.id, m.name, m.date                 -- 3. Group by movie
HAVING 
    COUNT(DISTINCT p.name) = 2           -- 4. Ensure BOTH people were found
ORDER BY 
    m.date DESC NULLS LAST;