// ticket-by-user
// SELECT COUNT(*) as ticket_number, login FROM helpdesk_ticket as ticket
// LEFT JOIN res_users ON ticket.user_id = res_users.id
// GROUP BY login 
// ORDER BY ticket_number DESC LIMIT 100

// ticket-by-category
// SELECT COUNT(*) as ticket_number, category.name FROM helpdesk_ticket as ticket
// LEFT JOIN helpdesk_ticket_category as category ON ticket.category_id = category.id
// GROUP BY category.name 
// ORDER BY ticket_number DESC

// ticket-by-created-date
// SELECT ticket.id, ticket.x_phone, ticket.partner_name, 
// ticket.create_date, stage.name, category.name,  FLOOR( extract( EPOCH FROM
//  age(current_timestamp, ticket.create_date))/86400) as days 
// FROM helpdesk_ticket as ticket
// LEFT JOIN helpdesk_ticket_stage as stage ON ticket.stage_id = stage.id
// LEFT JOIN helpdesk_ticket_category as category ON ticket.category_id = category.id
// WHERE stage_id IN (8,10)
// ORDER BY days DESC

// last weak ticket created by day
// SELECT count(*), cast(create_date AS DATE) as date
// 	FROM public.helpdesk_ticket
// 	where create_date >= CURRENT_DATE - INTERVAL '7 days'
// 	GROUP BY date;