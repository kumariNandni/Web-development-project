from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///directory.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')

# Initialize database
db = SQLAlchemy(app)

# Database Models
class Contact(db.Model):
    __tablename__ = 'contacts'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    department = db.Column(db.String(100))
    position = db.Column(db.String(100))
    company = db.Column(db.String(100))
    profile_image = db.Column(db.String(200))
    tags = db.Column(db.String(500))
    bio = db.Column(db.Text)
    linkedin = db.Column(db.String(200))
    github = db.Column(db.String(200))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'department': self.department or 'Unassigned',
            'position': self.position or 'Not Specified',
            'company': self.company or 'Not Specified',
            'profile_image': self.profile_image,
            'tags': self.tags.split(',') if self.tags else [],
            'bio': self.bio or '',
            'linkedin': self.linkedin,
            'github': self.github,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class ActivityLog(db.Model):
    __tablename__ = 'activity_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user = db.Column(db.String(100), default='System')
    action = db.Column(db.String(200), nullable=False)
    details = db.Column(db.Text)
    ip_address = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        return {
            'id': self.id,
            'user': self.user,
            'action': self.action,
            'details': self.details,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

class Department(db.Model):
    __tablename__ = 'departments'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    head = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'head': self.head
        }

# Create tables
with app.app_context():
    db.create_all()
    # Add default departments if none exist
    if Department.query.count() == 0:
        default_depts = [
            ('Engineering', 'Software development and technical operations', 'Tech Lead'),
            ('Marketing', 'Brand management and promotions', 'Marketing Head'),
            ('Sales', 'Client acquisition and revenue generation', 'Sales Director'),
            ('Human Resources', 'Recruitment and employee relations', 'HR Manager'),
            ('Finance', 'Budgeting and financial planning', 'CFO')
        ]
        for dept_name, dept_desc, dept_head in default_depts:
            dept = Department(name=dept_name, description=dept_desc, head=dept_head)
            db.session.add(dept)
        db.session.commit()
        print("Default departments added!")

# Simple AI Chatbot (no external imports needed)
def get_chatbot_response(message):
    message_lower = message.lower()
    
    if 'find' in message_lower or 'search' in message_lower:
        return "You can search for contacts using the search bar at the top of the page. Try typing a name, department, or company!"
    elif 'department' in message_lower:
        return "We have several departments: Engineering, Marketing, Sales, Human Resources, and Finance. Each department has talented professionals ready to help!"
    elif 'statistics' in message_lower or 'count' in message_lower:
        total = Contact.query.filter_by(is_active=True).count()
        return f"Currently, there are {total} active contacts in the directory. You can add more using the 'Add Contact' form!"
    elif 'hello' in message_lower or 'hi' in message_lower:
        return "Hello! I'm your AI assistant. I can help you find contacts, view department information, or show you statistics. How can I help you today?"
    elif 'help' in message_lower:
        return "I can help you with:\n- Search contacts: 'Find John'\n- Department info: 'Show departments'\n- Statistics: 'How many contacts?'\n- Just ask naturally!"
    else:
        return f"Thanks for your message! I'm here to help with directory management. You can ask me to search for contacts, show department info, or provide statistics. Try saying 'find contacts' or 'show me departments'!"

# API Routes
@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/api/contacts', methods=['GET'])
def get_contacts():
    search = request.args.get('search', '')
    department = request.args.get('department', '')
    
    query = Contact.query.filter_by(is_active=True)
    
    if search:
        query = query.filter(
            (Contact.name.ilike(f'%{search}%')) | 
            (Contact.email.ilike(f'%{search}%')) |
            (Contact.company.ilike(f'%{search}%')) |
            (Contact.department.ilike(f'%{search}%'))
        )
    
    if department:
        query = query.filter(Contact.department == department)
    
    contacts = query.order_by(Contact.name).all()
    return jsonify([contact.to_dict() for contact in contacts])

@app.route('/api/contacts', methods=['POST'])
def add_contact():
    try:
        data = request.json
        
        contact = Contact(
            name=data['name'],
            email=data['email'],
            phone=data['phone'],
            department=data.get('department', ''),
            position=data.get('position', ''),
            company=data.get('company', ''),
            tags=','.join(data.get('tags', [])),
            bio=data.get('bio', ''),
            linkedin=data.get('linkedin', ''),
            github=data.get('github', '')
        )
        
        db.session.add(contact)
        
        log = ActivityLog(
            user='System',
            action=f'Added new contact: {contact.name}',
            details=f'Contact created with email: {contact.email}'
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({'success': True, 'contact': contact.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        error_msg = str(e)
        if 'UNIQUE constraint failed' in error_msg:
            return jsonify({'success': False, 'error': 'A contact with this email already exists.'}), 400
        return jsonify({'success': False, 'error': error_msg}), 400

@app.route('/api/contacts/<int:id>', methods=['PUT'])
def update_contact(id):
    try:
        contact = Contact.query.get_or_404(id)
        data = request.json
        
        contact.name = data.get('name', contact.name)
        contact.email = data.get('email', contact.email)
        contact.phone = data.get('phone', contact.phone)
        contact.department = data.get('department', contact.department)
        contact.position = data.get('position', contact.position)
        contact.company = data.get('company', contact.company)
        contact.bio = data.get('bio', contact.bio)
        
        if 'tags' in data:
            contact.tags = ','.join(data['tags']) if isinstance(data['tags'], list) else data['tags']
        
        log = ActivityLog(
            action=f'Updated contact: {contact.name}',
            details=f'Contact {contact.email} was updated'
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({'success': True, 'contact': contact.to_dict()})
    except Exception as e:
        db.session.rollback()
        error_msg = str(e)
        if 'UNIQUE constraint failed' in error_msg:
            return jsonify({'success': False, 'error': 'A contact with this email already exists.'}), 400
        return jsonify({'success': False, 'error': error_msg}), 400

@app.route('/api/contacts/<int:id>', methods=['DELETE'])
def delete_contact(id):
    try:
        contact = Contact.query.get_or_404(id)
        name = contact.name
        contact.is_active = False
        
        log = ActivityLog(
            action=f'Deleted contact: {name}',
            details='Contact moved to archive'
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Contact deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/chatbot', methods=['POST'])
def chatbot_interaction():
    data = request.json
    user_message = data.get('message', '')
    response = get_chatbot_response(user_message)
    return jsonify({'response': response})

@app.route('/api/analytics/dashboard', methods=['GET'])
def get_dashboard_analytics():
    total_contacts = Contact.query.filter_by(is_active=True).count()
    total_departments = Department.query.count()
    
    from sqlalchemy import func
    dept_stats = db.session.query(
        Contact.department, 
        func.count(Contact.id)
    ).filter(Contact.is_active == True).group_by(Contact.department).all()
    
    recent_activities = ActivityLog.query.order_by(
        ActivityLog.timestamp.desc()
    ).limit(10).all()
    
    return jsonify({
        'total_contacts': total_contacts,
        'total_departments': total_departments,
        'department_distribution': [{'department': dept or 'Unassigned', 'count': count} for dept, count in dept_stats],
        'recent_activities': [log.to_dict() for log in recent_activities]
    })

@app.route('/api/departments', methods=['GET'])
def get_departments():
    departments = Department.query.all()
    return jsonify([dept.to_dict() for dept in departments])

if __name__ == '__main__':
    print("=" * 50)
    print("AI Directory Management System")
    print("=" * 50)
    print("Server starting...")
    print("Access at: http://localhost:5000")
    print("Press CTRL+C to stop")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)