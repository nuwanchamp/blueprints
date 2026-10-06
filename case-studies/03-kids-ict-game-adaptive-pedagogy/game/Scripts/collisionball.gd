extends RigidBody2D

@export var speed: float = 80.0             # initial drift speed
@export var bounce: float = 0.7             # 1.0 = perfectly elastic
@export var friction: float = 0.0           # 0 = frictionless, slides/bounces like a puck
@export var linear_damp_amount: float = 0.6 # higher = bleeds off speed faster over time

func _ready() -> void:
	gravity_scale = 0.0      # top-down game, no gravity
	linear_damp = linear_damp_amount
	# stops the cursor or fast balls tunneling through on hard hits
	continuous_cd = RigidBody2D.CCD_MODE_CAST_SHAPE

	var mat := PhysicsMaterial.new()
	mat.bounce = bounce
	mat.friction = friction
	physics_material_override = mat

	# initial random drift - the physics engine takes it from here
	linear_velocity = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized() * speed


# Keep the balls inside the screen without fighting the physics engine.
func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	var screen_size := get_viewport_rect().size
	var r := 0.0
	if has_node("CollisionShape2D") and $CollisionShape2D.shape is CircleShape2D:
		r = $CollisionShape2D.shape.radius

	var pos := state.transform.origin
	var vel := state.linear_velocity

	if pos.x - r < 0.0:
		pos.x = r
		vel.x = abs(vel.x)
	elif pos.x + r > screen_size.x:
		pos.x = screen_size.x - r
		vel.x = -abs(vel.x)

	if pos.y - r < 0.0:
		pos.y = r
		vel.y = abs(vel.y)
	elif pos.y + r > screen_size.y:
		pos.y = screen_size.y - r
		vel.y = -abs(vel.y)

	state.transform.origin = pos
	state.linear_velocity = vel
# in collisionball.gd
func set_gravity_enabled(enabled: bool) -> void:
	sleeping = false  # wake settled balls so the change takes effect
	if enabled:
		gravity_scale = 1.0
		linear_damp = 0.0   # damping was slowing the fall - let them drop properly
	else:
		gravity_scale = 0.0
		linear_damp = linear_damp_amount
		# back to random drifting
		linear_velocity = Vector2(randf_range(-1, 1), randf_range(-1, 1)).normalized() * speed
