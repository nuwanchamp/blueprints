extends RigidBody2D

@export var speed: float = 60.0
@export var bounce: float = 0.8

var _popped := false

func _ready() -> void:
	gravity_scale = 0.0
	linear_damp = 0.3
	
	var shader_mat := ShaderMaterial.new()
	shader_mat.shader = preload("res://Scripts/hue_shift.gdshader")
	shader_mat.set_shader_parameter("hue_shift", randf())            # random color
	shader_mat.set_shader_parameter("saturation", randf_range(0.8, 1.2))
	$AnimatedSprite2D.material = shader_mat

	var mat := PhysicsMaterial.new()
	mat.bounce = bounce
	mat.friction = 0.0
	physics_material_override = mat

	# needed for body_entered to fire
	contact_monitor = true
	max_contacts_reported = 4
	body_entered.connect(_on_body_entered)

	linear_velocity = Vector2(randf_range(-1, 1), randf_range(-1, 1)).normalized() * speed

	$AnimatedSprite2D.play("default")
	$AnimatedSprite2D.animation_finished.connect(_on_animation_finished)


func _on_body_entered(body: Node) -> void:
	if body.is_in_group("cursor"):
		pop()


func pop() -> void:
	if _popped:
		return
	_popped = true
	# stop colliding so other balloons pass through while it pops
	$CollisionShape2D.set_deferred("disabled", true)
	set_deferred("freeze", true)
	$AnimatedSprite2D.play("pops", 6.0)
	$AudioStreamPlayer2D.play()


func _on_animation_finished() -> void:
	if _popped:
		queue_free()


# same screen-bounce as the balls
func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	var screen_size := get_viewport_rect().size
	var r := 0.0
	if $CollisionShape2D.shape is CircleShape2D:
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
	
