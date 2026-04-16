from app import create_app
from app.extensions import db
from app.models import User, OrganizationNode, UserOrganization

app = create_app()
with app.app_context():
    # 创建管理员
    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            real_name='系统管理员',
            role='super_admin',
            is_active=True
        )
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print("管理员创建成功 (admin/admin123)")
    else:
        admin = User.query.filter_by(username='admin').first()
        print("管理员已存在")

    # 创建系统根节点
    if not OrganizationNode.query.filter_by(node_type='system').first():
        system_node = OrganizationNode(
            name='系统根节点',
            node_type='system',
            code='SYS001',
            description='系统自动创建的根节点'
        )
        db.session.add(system_node)
        db.session.commit()
        print("系统根节点创建成功")
    else:
        system_node = OrganizationNode.query.filter_by(node_type='system').first()

    # 关联管理员到根节点
    if admin and system_node and not UserOrganization.query.filter_by(user_id=admin.id, node_id=system_node.id).first():
        uo = UserOrganization(
            user_id=admin.id,
            node_id=system_node.id,
            role_in_node='系统管理员',
            is_primary=True
        )
        db.session.add(uo)
        db.session.commit()
        print("管理员已关联到系统根节点")

    print("初始化完成！")