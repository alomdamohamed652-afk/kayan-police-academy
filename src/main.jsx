const adminPath=location.pathname==='/admin'||location.pathname==='/settings';
if(adminPath){import('./admin-center.jsx');}else{import('./main-legacy.jsx');}
