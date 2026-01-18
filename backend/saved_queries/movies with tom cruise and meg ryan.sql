-- Selecting movies where both Tom Cruise and Meg Ryan acted together
SELECT DISTINCT 
    m.name AS movie_name,
    m.date AS release_date
FROM 
    movies m
JOIN 
    casts c1 ON m.id = c1.movie_id -- Join to get cast information for Tom Cruise
JOIN 
    people p1 ON c1.person_id = p1.id -- Join to link person to their name
JOIN 
    casts c2 ON m.id = c2.movie_id -- Join to get cast information for Meg Ryan
JOIN 
    people p2 ON c2.person_id = p2.id -- Join to link person to their name
WHERE 
    p1.name = 'Tom Cruise' -- Filter for Tom Cruise
    AND p2.name = 'Meg Ryan' -- Filter for Meg Ryan
ORDER BY 
    m.date DESC NULLS LAST -- Order by release date in descending order, with NULLs last
LIMIT 10; -- Limit the result to top 10 movies