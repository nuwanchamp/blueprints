extends Node2D

@onready var title: Label = $Label
@onready var backdrop: ColorRect = $Backdrop # must be a ColorRect/NinePatchRect named exactly "Backdrop", between Sprite2D and Label in the tree
@onready var start_button: Button = $Button

var target_scale: Vector2 = Vector2(1.5, 1.5) # tweak to the size you want
var button_gap: float = 60.0 # vertical gap between the title and the button
var center_pos: Vector2
var top_pos: Vector2

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	StarChart.hide_chart()

	Input.set_custom_mouse_cursor(preload("res://Assets/pointer.png"))

	var viewport_size = get_viewport_rect().size
	center_pos = viewport_size / 2
	top_pos = Vector2(viewport_size.x / 2, 80) # 80px from top, tweak as needed

	# Backdrop covers the whole screen and stays put - it doesn't scale/move
	backdrop.position = Vector2.ZERO
	backdrop.size = viewport_size
	backdrop.modulate.a = 0.0 # start fully transparent, fades in instead

	# Title's pivot is its own center so scaling grows from the middle
	title.pivot_offset = title.size / 2
	title.scale = Vector2.ZERO
	title.position = center_pos - title.pivot_offset

	# Button sits under the title's final resting spot, with a gap - hidden until the title lands
	var button_final_pos := top_pos + Vector2(0, (title.size.y * target_scale.y) / 2 + button_gap)
	start_button.pivot_offset = start_button.size / 2
	start_button.scale = Vector2.ZERO
	start_button.position = button_final_pos - start_button.pivot_offset

	# Animate: title scales up and moves to top center; backdrop just fades in - all together
	var tween := create_tween()
	tween.set_parallel(true)

	tween.tween_property(title, "scale", target_scale, 1.4)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(title, "position", top_pos - title.pivot_offset, 1.4)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	tween.tween_property(backdrop, "modulate:a", 1.0, 1.4)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	# .chain() switches back to sequential - button only pops in once the above finishes
	tween.chain().tween_property(start_button, "scale", Vector2.ONE, 0.5)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass # animation is handled by the Tween above, nothing needed here

func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)

func _on_button_pressed() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit1-into.tscn")
