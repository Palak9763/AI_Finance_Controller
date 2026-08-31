from .. import models


def write_audit(db, actor, action, entity_type, entity_id, previous_status=None, new_status=None,
                 ai_recommendation=None, human_decision=None, reason=None, metadata=None):
    log = models.AuditLog(
        actor=actor, action=action, entity_type=entity_type, entity_id=str(entity_id),
        previous_status=previous_status, new_status=new_status, ai_recommendation=ai_recommendation,
        human_decision=human_decision, reason=reason, audit_metadata=metadata,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
