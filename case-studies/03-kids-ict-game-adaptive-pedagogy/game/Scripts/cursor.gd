extends AnimatableBody2D

@export var follow_speed: float = 3000.0  # px/sec - high, but finite so fast flicks sweep instead of teleporting
@export var hide_os_cursor: bool = true

func _ready() -> void:
	if hide_os_cursor:
		Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN)

func _exit_tree() -> void:
	if hide_os_cursor:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)

func _physics_process(delta: float) -> void:
	var target := get_global_mouse_position()
	global_position = global_position.move_toward(target, follow_speed * delta)
