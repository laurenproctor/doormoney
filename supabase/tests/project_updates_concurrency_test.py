#!/usr/bin/env python3
"""Run only against a disposable, freshly migrated and seeded database.
Usage: PGHOST=127.0.0.1 PGPORT=55439 PGDATABASE=... python3 project_updates_concurrency_test.py
Docker: python3 project_updates_concurrency_test.py --container NAME --database NAME
Requires psql on PATH. Writes fixture rows; never point this at hosted/shared data.
"""
import argparse, os, subprocess, time
parser = argparse.ArgumentParser()
parser.add_argument('--container')
parser.add_argument('--database', default='doormoney_test')
args = parser.parse_args()
psql = (['docker', 'exec', '-i', args.container, 'psql', '-U', 'postgres', '-d', args.database]
        if args.container else ['psql'])
update='e1010000-0000-4000-8000-000000000603'
recognition='e1010000-0000-4000-8000-000000000604'
sponsor='e1010000-0000-4000-8000-000000000602'

def run(sql):
    return subprocess.run(psql + ['-X','-q','-At','-v','ON_ERROR_STOP=1','-c',sql],check=True,text=True,capture_output=True).stdout.strip()
def start(sql,name):
    return subprocess.Popen(psql + ['-X','-q','-At','-v','ON_ERROR_STOP=1','-c',f"set application_name = '{name}'; " + sql],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def wait_for(sql,process,label):
    until=time.monotonic()+10
    while time.monotonic()<until:
        if run(sql)=='t':return
        if process.poll() is not None:raise AssertionError(label+' exited before barrier: '+str(process.communicate()))
        time.sleep(.025)
    raise AssertionError(label+' never reached expected database lock barrier')
# Isolated account/update IDs; uses only the seed's untouched paid kick-head placement.
# These fixtures are intentionally left in the disposable CI database.
run(f"""
begin;
insert into auth.users(id,email) values
 ('e1010000-0000-4000-8000-000000000601','concurrent-owner@example.com'),
 ('{sponsor}','concurrent-sponsor@example.com');
update acts set owner_id='e1010000-0000-4000-8000-000000000601' where slug='gutter-hymns';
update patrons set profile_id='{sponsor}' where id='c1000000-0000-0000-0000-000000000001';
insert into project_updates(id,run_id,author_id,title,excerpt,body,published_at) values
 ('{update}','22222222-2222-2222-2222-222222222222','e1010000-0000-4000-8000-000000000601','Concurrency update','Excerpt','Original body',now());
insert into project_update_recognition(id,update_id,purchase_id,sponsor_id,display_name)
 select '{recognition}','{update}',id,'{sponsor}','Exact proposed name'
 from purchases where lot_id='a1000000-0000-0000-0000-000000000001';
insert into project_update_media(id,update_id,kind,provider,video_id,caption,position)
 values ('e1010000-0000-4000-8000-000000000605','{update}','embed','youtube','test-id','Initial caption',0);
commit;
""")
for kind in ['text','media']:
    for first in ['approval','edit']:
        label=f'{kind}-{first}-first'
        run(f"update project_update_recognition set approved_at=null,withdrawn_at=null where id='{recognition}'")
        version=int(run(f"select context_version from project_updates where id='{update}'"))
        approve=f"select approve_project_recognition('{recognition}','{sponsor}',{version})"
        edit=(f"update project_updates set body=body || ' changed' where id='{update}'" if kind=='text' else
              "update project_update_media set caption=caption || ' changed' where id='e1010000-0000-4000-8000-000000000605'")
        a=start(f"begin; {'set local role service_role; '+approve if first=='approval' else edit}; select pg_sleep(3); commit",'consent-a')
        wait_for("select exists(select 1 from pg_stat_activity where application_name='consent-a' and wait_event='PgSleep')",a,label+' A')
        b=start(('set role service_role; '+approve if first=='edit' else edit),'consent-b')
        wait_for("select exists(select 1 from pg_stat_activity where application_name='consent-b' and wait_event_type='Lock')",b,label+' B')
        aout,aerr=a.communicate(timeout=10);bout,berr=b.communicate(timeout=10)
        assert a.returncode==b.returncode==0,(label,aout,aerr,bout,berr)
        approval_result=bout if first=='edit' else aout
        assert ('f' if first=='edit' else 't') in approval_result.splitlines(),(label,approval_result)
        assert run(f"select context_version={version+1} from project_updates where id='{update}'")=='t',label
        assert run(f"select approved_at is null from project_update_recognition where id='{recognition}'")=='t',label
        print(f'PASS {label}: observed real lock wait; final version advanced; approval cleared or stale approval rejected',flush=True)
# Force the FK KEY SHARE -> consent-version bump interval on media insertion.
# RI constraint triggers sort before this test trigger; the consent AFTER trigger sorts after it.
# Approval arriving in that interval must wait, without a lock-upgrade deadlock.
run("""
create schema if not exists tests;
create function tests.pause_project_media_insert() returns trigger language plpgsql as $$
begin perform pg_sleep(3); return new; end; $$;
create trigger journal_concurrency_pause after insert on public.project_update_media
 for each row when (new.id='e1010000-0000-4000-8000-000000000606'::uuid)
 execute function tests.pause_project_media_insert();
""")
try:
    run(f"update project_update_recognition set approved_at=null where id='{recognition}'")
    version=int(run(f"select context_version from project_updates where id='{update}'"))
    a=start(f"begin; insert into project_update_media(id,update_id,kind,provider,video_id,position) values ('e1010000-0000-4000-8000-000000000606','{update}','embed','vimeo','56789',1); commit",'consent-a')
    wait_for("select exists(select 1 from pg_stat_activity where application_name='consent-a' and wait_event='PgSleep')",a,'media insert A')
    b=start(f"set role service_role; select approve_project_recognition('{recognition}','{sponsor}',{version})",'consent-b')
    wait_for("select exists(select 1 from pg_stat_activity where application_name='consent-b' and wait_event_type='Lock')",b,'media insert B')
    aout,aerr=a.communicate(timeout=10);bout,berr=b.communicate(timeout=10)
    assert a.returncode==b.returncode==0,('media insert',aout,aerr,bout,berr)
    assert 'f' in bout.splitlines(),bout
    assert run(f"select context_version={version+1} from project_updates where id='{update}'")=='t'
    assert run(f"select approved_at is null from project_update_recognition where id='{recognition}'")=='t'
    print('PASS media-insert-before-version-bump: observed FK lock wait; no deadlock; stale approval rejected',flush=True)
finally:
    run('drop trigger journal_concurrency_pause on public.project_update_media; drop function tests.pause_project_media_insert()')
print('5/5 concurrent approval/edit scenarios passed',flush=True)
